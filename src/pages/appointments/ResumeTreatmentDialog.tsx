import { useState, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { CheckSquare } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { appointmentsApi, patientsApi, apiErrorMessage, type Appointment, type Treatment, type TreatmentRecord } from "@/api/clinic";
import { useToast } from "@/hooks/use-toast";
import { sortSteps, findSubTreatment } from "./utils";

interface ResumeTreatmentDialogProps {
  isResumeDialogOpen: boolean;
  setIsResumeDialogOpen: Dispatch<SetStateAction<boolean>>;
  selectedAppointment: Appointment | null;
  allTreatments: Treatment[] | undefined;
  selectedSteps: string[];
  setSelectedSteps: Dispatch<SetStateAction<string[]>>;
}

/** "استكمال علاج" dialog: pick an unfinished treatment and tick the steps done today. */
export function ResumeTreatmentDialog({
  isResumeDialogOpen,
  setIsResumeDialogOpen,
  selectedAppointment,
  allTreatments,
  selectedSteps,
  setSelectedSteps,
}: ResumeTreatmentDialogProps) {
  const [resumeTreatmentNotes, setResumeTreatmentNotes] = useState("");
  const [selectedTreatmentRecord, setSelectedTreatmentRecord] = useState<TreatmentRecord | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Unfinished treatments for the patient (incomplete + de-duplicated server-side)
  const { data: unfinishedTreatments, error: unfinishedError } = useQuery({
    queryKey: ["unfinished-treatments", selectedAppointment?.patient_id],
    queryFn: () =>
      selectedAppointment?.patient_id
        ? patientsApi.treatmentRecords(selectedAppointment.patient_id, true)
        : Promise.resolve([] as TreatmentRecord[]),
    enabled: !!selectedAppointment?.patient_id,
  });

  // Steps for the selected treatment record
  const resumeTreatmentSteps = sortSteps(findSubTreatment(allTreatments, selectedTreatmentRecord?.sub_treatment_id)?.steps);

  // Steps already done for the selected treatment (across ALL its sessions)
  const { data: resumeCompletedSteps } = useQuery({
    queryKey: ["resume-completed-steps", selectedAppointment?.id, selectedTreatmentRecord?.id],
    queryFn: () =>
      selectedAppointment?.id && selectedTreatmentRecord?.id
        ? appointmentsApi.completedSteps(selectedAppointment.id, selectedTreatmentRecord.id)
        : Promise.resolve([] as string[]),
    enabled: !!selectedAppointment?.id && !!selectedTreatmentRecord?.id,
  });

  // F2: resume an unfinished treatment — one call
  const resumeStepsMutation = useMutation({
    mutationFn: (steps: string[]) => {
      if (!selectedAppointment || !selectedTreatmentRecord) throw new Error("No treatment record selected");
      return appointmentsApi.resume(selectedAppointment.id, {
        treatment_record_id: selectedTreatmentRecord.id,
        step_ids: steps,
        notes: resumeTreatmentNotes.trim() || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["completed-steps"] });
      queryClient.invalidateQueries({ queryKey: ["unfinished-treatments"] });
      queryClient.invalidateQueries({ queryKey: ["resume-completed-steps"] });
      setIsResumeDialogOpen(false);
      setSelectedSteps([]);
      setSelectedTreatmentRecord(null);
      setResumeTreatmentNotes("");
      toast({ title: "نجح", description: "تم استكمال خطوات العلاج بنجاح" });
    },
    onError: (e) => {
      toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" });
    },
  });

  return (
    <Dialog open={isResumeDialogOpen} onOpenChange={setIsResumeDialogOpen}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>استكمال علاج - {selectedAppointment?.patient?.full_name}</DialogTitle>
        </DialogHeader>

        {/* Debug info - remove in production */}
        {unfinishedTreatments && unfinishedTreatments.length > 0 ? (
          <div className="space-y-4">
            <div>
              <Label className="text-base font-semibold">اختر العلاج المراد استكماله</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                {unfinishedTreatments.map((treatment) => (
                  <Card
                    key={treatment.id}
                    className={`cursor-pointer transition-colors ${selectedTreatmentRecord?.id === treatment.id
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-muted/50'
                      }`}
                    onClick={() => {
                      setSelectedTreatmentRecord(treatment);
                      setSelectedSteps([]);
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-semibold">{treatment.treatment?.name}</h4>
                          <p className="text-sm text-muted-foreground">{treatment.sub_treatment?.name}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            السن: {treatment.tooth_number} | التكلفة: {Math.round(treatment.actual_cost_syp || 0).toLocaleString('en-US')} ل.س - {Math.round(treatment.actual_cost_usd || 0).toLocaleString('en-US')} $
                          </p>
                        </div>
                        <div className="text-xs text-orange-600 font-medium">
                          غير مكتمل
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {selectedTreatmentRecord && resumeTreatmentSteps && resumeTreatmentSteps.length > 0 && (
              <div className="space-y-3">
                <Label className="text-base font-semibold">خطوات العلاج المتبقية</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-60 overflow-y-auto border rounded-lg p-3 bg-muted/30">
                  {resumeTreatmentSteps.map((step) => {
                    const isCompleted = resumeCompletedSteps?.includes(step.id);
                    const isSelected = selectedSteps.includes(step.id);

                    return (
                      <div
                        key={step.id}
                        className={`flex items-start space-x-2 p-3 border rounded-lg transition-colors ${isCompleted ? 'bg-green-50 border-green-200' :
                          isSelected ? 'bg-blue-50 border-blue-200' : 'bg-card'
                          }`}
                      >
                        <Checkbox
                          id={`resume-${step.id}`}
                          checked={isSelected}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedSteps([...selectedSteps, step.id]);
                            } else {
                              setSelectedSteps(selectedSteps.filter(id => id !== step.id));
                            }
                          }}
                          disabled={isCompleted}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <Label
                            htmlFor={`resume-${step.id}`}
                            className={`cursor-pointer text-sm font-medium block ${isCompleted ? 'text-green-700' : ''}`}
                          >
                            {step.step_order}. {step.step_name}
                            {isCompleted && <span className="text-green-600 mr-2 text-xs block">✓ مكتملة سابقاً</span>}
                          </Label>
                          {step.step_description && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {step.step_description}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  اختر الخطوات التي تم إنجازها في هذا الموعد ({selectedSteps.length} خطوات جديدة)
                </p>
              </div>
            )}

            {selectedTreatmentRecord && (
              <>
                <div>
                  <Label htmlFor="resume_treatment_notes">ملاحظات العلاج</Label>
                  <Textarea
                    id="resume_treatment_notes"
                    value={resumeTreatmentNotes}
                    onChange={(e) => setResumeTreatmentNotes(e.target.value)}
                    placeholder="أضف ملاحظات حول العلاج..."
                    rows={3}
                    className="resize-none"
                  />
                  {selectedTreatmentRecord.treatment_notes && (
                    <p className="text-xs text-muted-foreground mt-1">
                      الملاحظات السابقة: {selectedTreatmentRecord.treatment_notes}
                    </p>
                  )}
                </div>
                <Button
                  onClick={() => resumeStepsMutation.mutate(selectedSteps)}
                  disabled={resumeStepsMutation.isPending || selectedSteps.length === 0}
                  className="w-full"
                >
                  {resumeStepsMutation.isPending ? "جاري الحفظ..." : `حفظ ${selectedSteps.length} خطوات مكتملة`}
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <CheckSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p>لا توجد علاجات غير مكتملة لهذا المريض</p>
            {unfinishedError && (
              <p className="text-red-500 text-sm mt-2">خطأ: {unfinishedError.message}</p>
            )}
            <p className="text-xs mt-2">معرف المريض: {selectedAppointment?.patient_id}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
