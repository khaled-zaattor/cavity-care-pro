import { useState, useEffect, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useUserRole } from "@/hooks/useUserRole";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { appointmentsApi, apiErrorMessage, type Appointment, type Currency, type Doctor, type Treatment } from "@/api/clinic";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { toNumberOrNull, sortSteps, formatNumberWithCommas, removeCommas, type TreatmentRecordForm } from "./utils";
import { ToothChart } from "./ToothChart";

interface RecordTreatmentDialogProps {
  isRecordDialogOpen: boolean;
  setIsRecordDialogOpen: Dispatch<SetStateAction<boolean>>;
  selectedAppointment: Appointment | null;
  doctors: Doctor[] | undefined;
  allTreatments: Treatment[] | undefined;
  selectedSteps: string[];
  setSelectedSteps: Dispatch<SetStateAction<string[]>>;
}

/** "تسجيل علاج" dialog: treatment / sub-treatment, teeth chart, costs, optional payment, notes and steps. */
export function RecordTreatmentDialog({
  isRecordDialogOpen,
  setIsRecordDialogOpen,
  selectedAppointment,
  doctors,
  allTreatments,
  selectedSteps,
  setSelectedSteps,
}: RecordTreatmentDialogProps) {
  const [teethType, setTeethType] = useState<"adult" | "child">("adult");
  const [treatmentRecord, setTreatmentRecord] = useState<TreatmentRecordForm>({
    treatment_id: "",
    sub_treatment_id: "",
    tooth_numbers: [] as string[],
    actual_cost_syp: "",
    actual_cost_usd: "",
    payment_amount: "",
    payment_currency: "SYP",
    notes: "",
    treatment_notes: "",
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canManagePayments } = useUserRole();

  // Load existing notes from appointment when dialog opens
  useEffect(() => {
    if (isRecordDialogOpen && selectedAppointment) {
      setTreatmentRecord(prev => ({
        ...prev,
        notes: selectedAppointment.notes || ""
      }));
    }
  }, [isRecordDialogOpen, selectedAppointment]);

  // Only offer the catalog that belongs to the selected appointment's doctor:
  // an independent doctor's own treatments, otherwise the clinic catalog (doctor_id NULL).
  const selectedAppointmentDoctor = doctors?.find((d) => d.id === selectedAppointment?.doctor_id);
  const catalogDoctorId = selectedAppointmentDoctor?.has_own_books ? selectedAppointmentDoctor.id : null;
  const treatments = allTreatments?.filter((t) => (t.doctor_id ?? null) === catalogDoctorId);
  const selectedTreatment = treatments?.find((t) => t.id === treatmentRecord.treatment_id);
  const subTreatments = selectedTreatment?.sub_treatments ?? [];
  const selectedSubTreatment = subTreatments.find((st) => st.id === treatmentRecord.sub_treatment_id);
  const treatmentSteps = sortSteps(selectedSubTreatment?.steps);
  const toothAssociation = selectedSubTreatment?.tooth_association || "not_related";
  const isToothSelectionEnabled = toothAssociation !== "not_related" && selectedTreatment?.specialty?.is_dental !== false;
  const isSingleToothOnly = toothAssociation === "single_tooth";

  // Query to get completed steps for an appointment
  const { data: completedSteps } = useQuery({
    queryKey: ["completed-steps", selectedAppointment?.id],
    queryFn: () => (selectedAppointment?.id ? appointmentsApi.completedSteps(selectedAppointment.id) : Promise.resolve([] as string[])),
    enabled: !!selectedAppointment?.id,
  });

  // F1: one call — the server decides completion, unfinished tracking and payment
  const recordTreatmentMutation = useMutation({
    mutationFn: (record: typeof treatmentRecord) => {
      if (!selectedAppointment) throw new Error("لم يتم اختيار موعد");
      return appointmentsApi.recordTreatment(selectedAppointment.id, {
        treatment_id: record.treatment_id,
        sub_treatment_id: record.sub_treatment_id,
        tooth_numbers: isToothSelectionEnabled ? record.tooth_numbers : [],
        actual_cost_syp: toNumberOrNull(record.actual_cost_syp),
        actual_cost_usd: toNumberOrNull(record.actual_cost_usd),
        payment_amount: toNumberOrNull(record.payment_amount),
        payment_currency: record.payment_currency as Currency,
        notes: record.notes || null,
        treatment_notes: record.treatment_notes || null,
        step_ids: selectedSteps,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["completed-steps"] });
      queryClient.invalidateQueries({ queryKey: ["unfinished-treatments"] });
      setIsRecordDialogOpen(false);
      setTreatmentRecord({ treatment_id: "", sub_treatment_id: "", tooth_numbers: [], actual_cost_syp: "", actual_cost_usd: "", payment_amount: "", payment_currency: "SYP", notes: "", treatment_notes: "" });
      setTeethType("adult");
      setSelectedSteps([]);
      toast({ title: "نجح", description: "تم تسجيل العلاج والدفعة بنجاح" });
    },
    onError: (e) => {
      toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" });
    },
  });

  // Validation schema for treatment notes
  const treatmentNotesSchema = z.object({
    notes: z.string().max(2000, { message: "الملاحظات يجب أن لا تتجاوز 2000 حرف" })
  });

  const handleRecordTreatment = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate notes
    try {
      treatmentNotesSchema.parse({ notes: treatmentRecord.notes });
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "خطأ في التحقق",
          description: error.errors[0].message,
          variant: "destructive"
        });
        return;
      }
    }

    recordTreatmentMutation.mutate(treatmentRecord);
  };

  return (
    <Dialog open={isRecordDialogOpen} onOpenChange={setIsRecordDialogOpen}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>تسجيل علاج</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleRecordTreatment} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="treatment_id">العلاج</Label>
              <Select
                value={treatmentRecord.treatment_id}
                onValueChange={(value) => setTreatmentRecord({ ...treatmentRecord, treatment_id: value, sub_treatment_id: "" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر علاج" />
                </SelectTrigger>
                <SelectContent>
                  {treatments?.map((treatment) => (
                    <SelectItem key={treatment.id} value={treatment.id}>
                      {treatment.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="sub_treatment_id">العلاج الفرعي</Label>
              <Select
                value={treatmentRecord.sub_treatment_id}
                onValueChange={(value) => {
                  const chosenSubTreatment = subTreatments.find(st => st.id === value);
                  setTreatmentRecord({
                    ...treatmentRecord,
                    sub_treatment_id: value,
                    actual_cost_syp: chosenSubTreatment?.estimated_cost_syp?.toString().replace(/,/g, '') || "",
                    actual_cost_usd: chosenSubTreatment?.estimated_cost_usd?.toString().replace(/,/g, '') || "",
                    tooth_numbers: [] // Reset tooth selection when changing sub-treatment
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر علاج فرعي" />
                </SelectTrigger>
                <SelectContent>
                  {subTreatments?.map((subTreatment) => (
                    <SelectItem key={subTreatment.id} value={subTreatment.id}>
                      {subTreatment.name} - {formatNumberWithCommas(subTreatment.estimated_cost_syp?.toString() || '0')} ل.س
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {(() => {
            // isToothSelectionEnabled: sub-treatment linked to teeth AND a dental treatment
            return (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <Label>رقم السن</Label>
                  {!isToothSelectionEnabled ? (
                    <div className="border rounded-lg p-3 bg-muted/30 text-center text-sm text-muted-foreground">
                      هذا العلاج غير مرتبط بأسنان محددة
                    </div>
                  ) : (
                      <ToothChart
                        teethType={teethType}
                        setTeethType={setTeethType}
                        treatmentRecord={treatmentRecord}
                        setTreatmentRecord={setTreatmentRecord}
                        isSingleToothOnly={isSingleToothOnly}
                      />
                  )}
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="actual_cost_syp">التكلفة بالليرة السورية</Label>
                      <Input
                        id="actual_cost_syp"
                        type="text"
                        value={treatmentRecord.actual_cost_syp ? formatNumberWithCommas(treatmentRecord.actual_cost_syp) : ''}
                        onChange={(e) => {
                          const rawValue = removeCommas(e.target.value);
                          setTreatmentRecord({ ...treatmentRecord, actual_cost_syp: rawValue });
                        }}
                        placeholder="التكلفة بالليرة"
                      />
                    </div>
                    <div>
                      <Label htmlFor="actual_cost_usd">التكلفة بالدولار</Label>
                      <Input
                        id="actual_cost_usd"
                        type="text"
                        value={treatmentRecord.actual_cost_usd ? formatNumberWithCommas(treatmentRecord.actual_cost_usd) : ''}
                        onChange={(e) => {
                          const rawValue = removeCommas(e.target.value);
                          setTreatmentRecord({ ...treatmentRecord, actual_cost_usd: rawValue });
                        }}
                        placeholder="التكلفة بالدولار"
                      />
                    </div>
                  </div>
                  {canManagePayments && (
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <Label htmlFor="payment_amount">مبلغ الدفعة (اختياري)</Label>
                        <Input
                          id="payment_amount"
                          type="text"
                          value={treatmentRecord.payment_amount ? formatNumberWithCommas(treatmentRecord.payment_amount) : ''}
                          onChange={(e) => {
                            const rawValue = removeCommas(e.target.value);
                            setTreatmentRecord({ ...treatmentRecord, payment_amount: rawValue });
                          }}
                          placeholder="أدخل مبلغ الدفعة"
                        />
                      </div>
                      <div>
                        <Label htmlFor="payment_currency">العملة</Label>
                        <Select value={treatmentRecord.payment_currency} onValueChange={(value) => setTreatmentRecord({ ...treatmentRecord, payment_currency: value })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="SYP">ل.س</SelectItem>
                            <SelectItem value="USD">$</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                  {canManagePayments && (
                    <p className="text-xs text-muted-foreground mt-1">
                      اترك فارغاً إذا لم يتم الدفع
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Notes Section - Split into two columns */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="appointment_notes">ملاحظة الموعد</Label>
              <Textarea
                id="appointment_notes"
                value={treatmentRecord.notes}
                onChange={(e) => setTreatmentRecord({ ...treatmentRecord, notes: e.target.value })}
                placeholder="أضف ملاحظات حول الموعد..."
                rows={3}
                className="resize-none"
              />
              {selectedAppointment?.notes && (
                <p className="text-xs text-muted-foreground mt-1">
                  الملاحظة السابقة: {selectedAppointment.notes}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="treatment_notes_field">ملاحظة العلاج</Label>
              <Textarea
                id="treatment_notes_field"
                value={treatmentRecord.treatment_notes}
                onChange={(e) => setTreatmentRecord({ ...treatmentRecord, treatment_notes: e.target.value })}
                placeholder="أضف ملاحظات حول العلاج..."
                rows={3}
                className="resize-none"
              />
            </div>
          </div>

          {/* Treatment Steps Section */}
          {treatmentRecord.sub_treatment_id && treatmentSteps && treatmentSteps.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">خطوات العلاج المنجزة في هذا الموعد</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 max-h-48 overflow-y-auto border rounded-lg p-2 bg-muted/30">
                {treatmentSteps.map((step) => {
                  const isCompleted = completedSteps?.includes(step.id);
                  const isSelected = selectedSteps.includes(step.id);

                  return (
                    <div
                      key={step.id}
                      className={`flex items-start space-x-2 p-2 border rounded transition-colors ${isCompleted ? 'bg-green-50 border-green-200' :
                        isSelected ? 'bg-blue-50 border-blue-200' : 'bg-card'
                        }`}
                    >
                      <Checkbox
                        id={step.id}
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedSteps([...selectedSteps, step.id]);
                          } else {
                            setSelectedSteps(selectedSteps.filter(id => id !== step.id));
                          }
                        }}
                        disabled={isCompleted}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <Label
                          htmlFor={step.id}
                          className={`cursor-pointer text-xs font-medium block ${isCompleted ? 'text-green-700' : ''}`}
                        >
                          {step.step_order}. {step.step_name}
                          {isCompleted && <span className="text-green-600 mr-1 text-xs">✓</span>}
                        </Label>
                        {step.step_description && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {step.step_description}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                ({selectedSteps.length} من {treatmentSteps.length} خطوات محددة)
              </p>
            </div>
          )}

          <Button type="submit" disabled={recordTreatmentMutation.isPending}>
            {recordTreatmentMutation.isPending ? "جاري التسجيل..." : "تسجيل العلاج والخطوات"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
