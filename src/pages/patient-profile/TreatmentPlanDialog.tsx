import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FileText } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { moneyApi, type Doctor, type Treatment } from "@/api/clinic";

interface TreatmentPlanDialogProps {
  patientId: string;
  doctors: Doctor[] | undefined;
  treatments: Treatment[] | undefined;
  showError: (e: unknown) => void;
}

/** "إضافة خطة علاج" quick action: treatment / sub-treatment and teeth chart. */
export function TreatmentPlanDialog({ patientId, doctors, treatments, showError }: TreatmentPlanDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isTreatmentPlanDialogOpen, setIsTreatmentPlanDialogOpen] = useState(false);

  const [treatmentPlan, setTreatmentPlan] = useState({
    treatment_id: "",
    sub_treatment_id: "",
    tooth_number: "",
  });
  const [planTeethType, setPlanTeethType] = useState<"adult" | "child">("adult");

  const selectedPlanTreatment = treatments?.find((t) => t.id === treatmentPlan.treatment_id);
  const subTreatments = selectedPlanTreatment?.sub_treatments ?? [];
  const showSpecialty = new Set(treatments?.map((t) => t.specialty_id)).size > 1;

  // Create treatment plan mutation
  const createTreatmentPlanMutation = useMutation({
    mutationFn: (plan: typeof treatmentPlan) =>
      moneyApi.createPlan({
        patient_id: patientId,
        treatment_id: plan.treatment_id,
        sub_treatment_id: plan.sub_treatment_id,
        tooth_numbers: plan.tooth_number.split(",").map((t) => t.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-plans", patientId] });
      setIsTreatmentPlanDialogOpen(false);
      setTreatmentPlan({ treatment_id: "", sub_treatment_id: "", tooth_number: "" });
      toast({ title: "نجح", description: "تم إضافة خطة العلاج بنجاح" });
    },
    onError: showError,
  });

  const handleAddTreatmentPlan = (e: React.FormEvent) => {
    e.preventDefault();
    createTreatmentPlanMutation.mutate(treatmentPlan);
  };

  return (
    <Dialog open={isTreatmentPlanDialogOpen} onOpenChange={setIsTreatmentPlanDialogOpen}>
      <DialogTrigger asChild>
        <Button className="w-full" variant="outline">
          <FileText className="ml-2 h-4 w-4" />
          إضافة خطة علاج
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إضافة خطة علاج</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleAddTreatmentPlan} className="space-y-4">
          <div>
            <Label htmlFor="treatment_id">العلاج</Label>
            <Select value={treatmentPlan.treatment_id} onValueChange={(value) => setTreatmentPlan({ ...treatmentPlan, treatment_id: value, sub_treatment_id: "" })}>
              <SelectTrigger>
                <SelectValue placeholder="اختر علاج" />
              </SelectTrigger>
              <SelectContent>
                {treatments?.map((treatment) => (
                  // the catalog is split by specialty: label each treatment with it
                  <SelectItem key={treatment.id} value={treatment.id}>
                    {treatment.name}{showSpecialty && treatment.specialty ? ` (${treatment.specialty.name_ar})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="sub_treatment_id">العلاج الفرعي</Label>
            <Select 
              value={treatmentPlan.sub_treatment_id} 
              onValueChange={(value) => setTreatmentPlan({ ...treatmentPlan, sub_treatment_id: value })}
              disabled={!treatmentPlan.treatment_id}
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر علاج فرعي" />
              </SelectTrigger>
              <SelectContent>
                {subTreatments.map((subTreatment) => (
                  <SelectItem key={subTreatment.id} value={subTreatment.id}>
                    {subTreatment.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tooth Selection Section */}
        {(() => {
          // Non-dental specialties have no tooth chart at all
          if (selectedPlanTreatment?.specialty && !selectedPlanTreatment.specialty.is_dental) return null;
          const selectedSubTreatment = subTreatments.find(st => st.id === treatmentPlan.sub_treatment_id);
          const toothAssociation = selectedSubTreatment?.tooth_association || "not_related";
          const isToothSelectionEnabled = toothAssociation !== "not_related";
          const isSingleToothOnly = toothAssociation === "single_tooth";

          return (
            <div>
              <Label>رقم السن</Label>
              {!isToothSelectionEnabled ? (
                <div className="border rounded-lg p-3 bg-muted/30 text-center text-sm text-muted-foreground">
                  هذا العلاج غير مرتبط بأسنان محددة
                </div>
              ) : (
                <div className="border rounded-lg p-3 bg-muted/30">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-center text-xs font-medium flex-1">
                      مخطط الأسنان - النظام العالمي
                      {isSingleToothOnly && (
                        <span className="block text-xs text-primary mt-1">يُسمح باختيار سن واحد فقط</span>
                      )}
                    </div>
                  </div>

                  {/* اختيار نوع الأسنان */}
                  <div className="mb-3">
                    <RadioGroup 
                      value={planTeethType} 
                      onValueChange={(value: "adult" | "child") => {
                        setPlanTeethType(value);
                        setTreatmentPlan({ ...treatmentPlan, tooth_number: "" });
                      }} 
                      className="flex gap-4 justify-center"
                    >
                      <div className="flex items-center space-x-2 space-x-reverse">
                        <RadioGroupItem value="adult" id="plan-adult" />
                        <Label htmlFor="plan-adult" className="cursor-pointer">أسنان البالغين</Label>
                      </div>
                      <div className="flex items-center space-x-2 space-x-reverse">
                        <RadioGroupItem value="child" id="plan-child" />
                        <Label htmlFor="plan-child" className="cursor-pointer">أسنان الأطفال</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {planTeethType === "adult" ? (
                    <>
                      {/* أسنان البالغين */}
                      <div className="mb-3">
                        <div className="text-xs text-center text-muted-foreground mb-1">الفك العلوي</div>
                        <div className="grid grid-cols-8 gap-1 mb-1">
                          {[18, 17, 16, 15, 14, 13, 12, 11].map((toothNum) => (
                            <button
                              key={toothNum}
                              type="button"
                              onClick={() => {
                                const toothStr = toothNum.toString();
                                if (isSingleToothOnly) {
                                  setTreatmentPlan({ ...treatmentPlan, tooth_number: toothStr });
                                } else {
                                  const currentTeeth = treatmentPlan.tooth_number.split(", ").filter(t => t);
                                  const newTeeth = currentTeeth.includes(toothStr)
                                    ? currentTeeth.filter(t => t !== toothStr)
                                    : [...currentTeeth, toothStr];
                                  setTreatmentPlan({ ...treatmentPlan, tooth_number: newTeeth.join(", ") });
                                }
                              }}
                              className={`h-6 w-6 text-xs font-medium border rounded transition-colors ${
                                treatmentPlan.tooth_number.split(", ").includes(toothNum.toString())
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-background hover:bg-muted border-border'
                              }`}
                            >
                              {toothNum}
                            </button>
                          ))}
                        </div>
                        <div className="grid grid-cols-8 gap-1">
                          {[21, 22, 23, 24, 25, 26, 27, 28].map((toothNum) => (
                            <button
                              key={toothNum}
                              type="button"
                              onClick={() => {
                                const toothStr = toothNum.toString();
                                if (isSingleToothOnly) {
                                  setTreatmentPlan({ ...treatmentPlan, tooth_number: toothStr });
                                } else {
                                  const currentTeeth = treatmentPlan.tooth_number.split(", ").filter(t => t);
                                  const newTeeth = currentTeeth.includes(toothStr)
                                    ? currentTeeth.filter(t => t !== toothStr)
                                    : [...currentTeeth, toothStr];
                                  setTreatmentPlan({ ...treatmentPlan, tooth_number: newTeeth.join(", ") });
                                }
                              }}
                              className={`h-6 w-6 text-xs font-medium border rounded transition-colors ${
                                treatmentPlan.tooth_number.split(", ").includes(toothNum.toString())
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-background hover:bg-muted border-border'
                              }`}
                            >
                              {toothNum}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-center text-muted-foreground mb-1">الفك السفلي</div>
                        <div className="grid grid-cols-8 gap-1 mb-1">
                          {[31, 32, 33, 34, 35, 36, 37, 38].map((toothNum) => (
                            <button
                              key={toothNum}
                              type="button"
                              onClick={() => {
                                const toothStr = toothNum.toString();
                                if (isSingleToothOnly) {
                                  setTreatmentPlan({ ...treatmentPlan, tooth_number: toothStr });
                                } else {
                                  const currentTeeth = treatmentPlan.tooth_number.split(", ").filter(t => t);
                                  const newTeeth = currentTeeth.includes(toothStr)
                                    ? currentTeeth.filter(t => t !== toothStr)
                                    : [...currentTeeth, toothStr];
                                  setTreatmentPlan({ ...treatmentPlan, tooth_number: newTeeth.join(", ") });
                                }
                              }}
                              className={`h-6 w-6 text-xs font-medium border rounded transition-colors ${
                                treatmentPlan.tooth_number.split(", ").includes(toothNum.toString())
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-background hover:bg-muted border-border'
                              }`}
                            >
                              {toothNum}
                            </button>
                          ))}
                        </div>
                        <div className="grid grid-cols-8 gap-1">
                          {[41, 42, 43, 44, 45, 46, 47, 48].map((toothNum) => (
                            <button
                              key={toothNum}
                              type="button"
                              onClick={() => {
                                const toothStr = toothNum.toString();
                                if (isSingleToothOnly) {
                                  setTreatmentPlan({ ...treatmentPlan, tooth_number: toothStr });
                                } else {
                                  const currentTeeth = treatmentPlan.tooth_number.split(", ").filter(t => t);
                                  const newTeeth = currentTeeth.includes(toothStr)
                                    ? currentTeeth.filter(t => t !== toothStr)
                                    : [...currentTeeth, toothStr];
                                  setTreatmentPlan({ ...treatmentPlan, tooth_number: newTeeth.join(", ") });
                                }
                              }}
                              className={`h-6 w-6 text-xs font-medium border rounded transition-colors ${
                                treatmentPlan.tooth_number.split(", ").includes(toothNum.toString())
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-background hover:bg-muted border-border'
                              }`}
                            >
                              {toothNum}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* أسنان الأطفال */}
                      <div className="mb-3">
                        <div className="text-xs text-center text-muted-foreground mb-1">الفك العلوي</div>
                        <div className="grid grid-cols-5 gap-1 mb-1">
                          {[55, 54, 53, 52, 51].map((toothNum) => (
                            <button
                              key={toothNum}
                              type="button"
                              onClick={() => {
                                const toothStr = toothNum.toString();
                                if (isSingleToothOnly) {
                                  setTreatmentPlan({ ...treatmentPlan, tooth_number: toothStr });
                                } else {
                                  const currentTeeth = treatmentPlan.tooth_number.split(", ").filter(t => t);
                                  const newTeeth = currentTeeth.includes(toothStr)
                                    ? currentTeeth.filter(t => t !== toothStr)
                                    : [...currentTeeth, toothStr];
                                  setTreatmentPlan({ ...treatmentPlan, tooth_number: newTeeth.join(", ") });
                                }
                              }}
                              className={`h-6 w-6 text-xs font-medium border rounded transition-colors ${
                                treatmentPlan.tooth_number.split(", ").includes(toothNum.toString())
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-background hover:bg-muted border-border'
                              }`}
                            >
                              {toothNum}
                            </button>
                          ))}
                        </div>
                        <div className="grid grid-cols-5 gap-1">
                          {[61, 62, 63, 64, 65].map((toothNum) => (
                            <button
                              key={toothNum}
                              type="button"
                              onClick={() => {
                                const toothStr = toothNum.toString();
                                if (isSingleToothOnly) {
                                  setTreatmentPlan({ ...treatmentPlan, tooth_number: toothStr });
                                } else {
                                  const currentTeeth = treatmentPlan.tooth_number.split(", ").filter(t => t);
                                  const newTeeth = currentTeeth.includes(toothStr)
                                    ? currentTeeth.filter(t => t !== toothStr)
                                    : [...currentTeeth, toothStr];
                                  setTreatmentPlan({ ...treatmentPlan, tooth_number: newTeeth.join(", ") });
                                }
                              }}
                              className={`h-6 w-6 text-xs font-medium border rounded transition-colors ${
                                treatmentPlan.tooth_number.split(", ").includes(toothNum.toString())
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-background hover:bg-muted border-border'
                              }`}
                            >
                              {toothNum}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-center text-muted-foreground mb-1">الفك السفلي</div>
                        <div className="grid grid-cols-5 gap-1 mb-1">
                          {[71, 72, 73, 74, 75].map((toothNum) => (
                            <button
                              key={toothNum}
                              type="button"
                              onClick={() => {
                                const toothStr = toothNum.toString();
                                if (isSingleToothOnly) {
                                  setTreatmentPlan({ ...treatmentPlan, tooth_number: toothStr });
                                } else {
                                  const currentTeeth = treatmentPlan.tooth_number.split(", ").filter(t => t);
                                  const newTeeth = currentTeeth.includes(toothStr)
                                    ? currentTeeth.filter(t => t !== toothStr)
                                    : [...currentTeeth, toothStr];
                                  setTreatmentPlan({ ...treatmentPlan, tooth_number: newTeeth.join(", ") });
                                }
                              }}
                              className={`h-6 w-6 text-xs font-medium border rounded transition-colors ${
                                treatmentPlan.tooth_number.split(", ").includes(toothNum.toString())
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-background hover:bg-muted border-border'
                              }`}
                            >
                              {toothNum}
                            </button>
                          ))}
                        </div>
                        <div className="grid grid-cols-5 gap-1">
                          {[81, 82, 83, 84, 85].map((toothNum) => (
                            <button
                              key={toothNum}
                              type="button"
                              onClick={() => {
                                const toothStr = toothNum.toString();
                                if (isSingleToothOnly) {
                                  setTreatmentPlan({ ...treatmentPlan, tooth_number: toothStr });
                                } else {
                                  const currentTeeth = treatmentPlan.tooth_number.split(", ").filter(t => t);
                                  const newTeeth = currentTeeth.includes(toothStr)
                                    ? currentTeeth.filter(t => t !== toothStr)
                                    : [...currentTeeth, toothStr];
                                  setTreatmentPlan({ ...treatmentPlan, tooth_number: newTeeth.join(", ") });
                                }
                              }}
                              className={`h-6 w-6 text-xs font-medium border rounded transition-colors ${
                                treatmentPlan.tooth_number.split(", ").includes(toothNum.toString())
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-background hover:bg-muted border-border'
                              }`}
                            >
                              {toothNum}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {treatmentPlan.tooth_number && (
                    <div className="mt-3 p-2 bg-primary/10 rounded text-center">
                      <span className="text-sm font-medium">الأسنان المختارة: </span>
                      <span className="text-sm text-primary">{treatmentPlan.tooth_number}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        <Button type="submit" disabled={createTreatmentPlanMutation.isPending}>
          {createTreatmentPlanMutation.isPending ? "جاري الإضافة..." : "إضافة"}
        </Button>
      </form>
      </DialogContent>
    </Dialog>
  );
}
