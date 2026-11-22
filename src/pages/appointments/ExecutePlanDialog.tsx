import { useState, useEffect, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Trash2, ClipboardCheck } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  appointmentsApi,
  patientsApi,
  moneyApi,
  apiErrorMessage,
  type Appointment,
  type Currency,
  type Treatment,
  type TreatmentPlan,
} from "@/api/clinic";
import { useToast } from "@/hooks/use-toast";
import { toNumberOrNull, sortSteps, findSubTreatment } from "./utils";

interface ExecutePlanDialogProps {
  isExecutePlanDialogOpen: boolean;
  setIsExecutePlanDialogOpen: Dispatch<SetStateAction<boolean>>;
  selectedAppointment: Appointment | null;
  allTreatments: Treatment[] | undefined;
  selectedSteps: string[];
  setSelectedSteps: Dispatch<SetStateAction<string[]>>;
}

/** "تنفيذ خطة علاج": plan picker dialog + execution details dialog. */
export function ExecutePlanDialog({
  isExecutePlanDialogOpen,
  setIsExecutePlanDialogOpen,
  selectedAppointment,
  allTreatments,
  selectedSteps,
  setSelectedSteps,
}: ExecutePlanDialogProps) {
  const [isExecutePlanDetailsDialogOpen, setIsExecutePlanDetailsDialogOpen] = useState(false);
  const [selectedTreatmentPlan, setSelectedTreatmentPlan] = useState<TreatmentPlan | null>(null);

  const [planExecution, setPlanExecution] = useState({
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

  // Pending treatment plans for the patient
  const { data: treatmentPlans } = useQuery({
    queryKey: ["treatment-plans", selectedAppointment?.patient_id],
    queryFn: () =>
      selectedAppointment?.patient_id
        ? patientsApi.plans(selectedAppointment.patient_id, true)
        : Promise.resolve([] as TreatmentPlan[]),
    enabled: !!selectedAppointment?.patient_id,
  });

  // Steps for the selected treatment plan
  const planTreatmentSteps = sortSteps(findSubTreatment(allTreatments, selectedTreatmentPlan?.sub_treatment_id)?.steps);

  // Auto-fill actual_cost when treatment plan is selected
  useEffect(() => {
    if (selectedTreatmentPlan) {
      const sub = selectedTreatmentPlan.sub_treatment;
      setPlanExecution(prev => ({
        ...prev,
        actual_cost_syp: sub?.estimated_cost_syp?.toString().replace(/,/g, '') || "",
        actual_cost_usd: sub?.estimated_cost_usd?.toString().replace(/,/g, '') || ""
      }));
    }
  }, [selectedTreatmentPlan]);

  // F3: execute a treatment plan — one call
  const executePlanMutation = useMutation({
    mutationFn: () => {
      if (!selectedTreatmentPlan || !selectedAppointment) throw new Error("No treatment plan selected");
      return appointmentsApi.executePlan(selectedAppointment.id, {
        treatment_plan_id: selectedTreatmentPlan.id,
        actual_cost_syp: toNumberOrNull(planExecution.actual_cost_syp),
        actual_cost_usd: toNumberOrNull(planExecution.actual_cost_usd),
        payment_amount: toNumberOrNull(planExecution.payment_amount),
        payment_currency: planExecution.payment_currency as Currency,
        notes: planExecution.notes || null,
        treatment_notes: planExecution.treatment_notes || null,
        step_ids: selectedSteps,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["completed-steps"] });
      queryClient.invalidateQueries({ queryKey: ["treatment-plans"] });
      queryClient.invalidateQueries({ queryKey: ["unfinished-treatments"] });
      setIsExecutePlanDetailsDialogOpen(false);
      setIsExecutePlanDialogOpen(false);
      setSelectedTreatmentPlan(null);
      setPlanExecution({ actual_cost_syp: "", actual_cost_usd: "", payment_amount: "", payment_currency: "SYP", notes: "", treatment_notes: "" });
      setSelectedSteps([]);
      toast({ title: "نجح", description: "تم تنفيذ خطة العلاج بنجاح" });
    },
    onError: (e) => {
      toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" });
    },
  });

  const deletePlan = async (planId: string) => {
    try {
      await moneyApi.removePlan(planId);
      queryClient.invalidateQueries({ queryKey: ["treatment-plans"] });
      setIsExecutePlanDetailsDialogOpen(false);
      setSelectedTreatmentPlan(null);
      toast({ title: "نجح", description: "تم حذف الخطة بنجاح" });
    } catch (e) {
      toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" });
    }
  };

  return (
    <>
      {/* Execute Treatment Plan Dialog - Select Plan */}
      <Dialog open={isExecutePlanDialogOpen} onOpenChange={setIsExecutePlanDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>تنفيذ خطة علاج</DialogTitle>
          </DialogHeader>
          {treatmentPlans && treatmentPlans.length > 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                اختر خطة العلاج المراد تنفيذها لهذا الموعد
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {treatmentPlans.map((plan) => (
                  <div
                    key={plan.id}
                    className="p-4 border rounded-lg cursor-pointer transition-colors hover:bg-accent hover:border-primary"
                    onClick={() => {
                      setSelectedTreatmentPlan(plan);
                      setIsExecutePlanDetailsDialogOpen(true);
                      setIsExecutePlanDialogOpen(false);
                    }}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{plan.treatment?.name}</p>
                        <p className="text-sm text-muted-foreground">{plan.sub_treatment?.name}</p>
                        <p className="text-xs text-muted-foreground mt-1">رقم السن: {plan.tooth_number}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <ClipboardCheck className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <p>لا توجد خطط علاج غير منفذة لهذا المريض</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Execute Treatment Plan Dialog - Details */}
      <Dialog open={isExecutePlanDetailsDialogOpen} onOpenChange={setIsExecutePlanDetailsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تفاصيل تنفيذ خطة العلاج</DialogTitle>
          </DialogHeader>
          {selectedTreatmentPlan && (
            <form onSubmit={(e) => {
              e.preventDefault();
              executePlanMutation.mutate();
            }} className="space-y-3">
              <div className="p-2 bg-muted rounded-lg flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{selectedTreatmentPlan.treatment?.name} - {selectedTreatmentPlan.sub_treatment?.name}</p>
                  <p className="text-xs text-muted-foreground">رقم السن: {selectedTreatmentPlan.tooth_number}</p>
                </div>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsExecutePlanDetailsDialogOpen(false);
                      setIsExecutePlanDialogOpen(true);
                    }}
                    className="h-8 w-8 p-0"
                    title="تعديل"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (window.confirm("هل أنت متأكد من حذف هذه الخطة؟")) {
                        deletePlan(selectedTreatmentPlan.id);
                      }
                    }}
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    title="حذف"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="actual_cost_syp" className="text-sm">التكلفة بالليرة</Label>
                  <Input
                    id="actual_cost_syp"
                    type="number"
                    step="0.01"
                    value={planExecution.actual_cost_syp}
                    onChange={(e) => setPlanExecution({ ...planExecution, actual_cost_syp: e.target.value })}
                    placeholder="التكلفة بالليرة"
                    className="h-9"
                  />
                </div>
                <div>
                  <Label htmlFor="actual_cost_usd" className="text-sm">التكلفة بالدولار</Label>
                  <Input
                    id="actual_cost_usd"
                    type="number"
                    step="0.01"
                    value={planExecution.actual_cost_usd}
                    onChange={(e) => setPlanExecution({ ...planExecution, actual_cost_usd: e.target.value })}
                    placeholder="التكلفة بالدولار"
                    className="h-9"
                  />
                </div>
              </div>

              {canManagePayments && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <Label htmlFor="payment_amount" className="text-sm">المبلغ المدفوع</Label>
                    <Input
                      id="payment_amount"
                      type="number"
                      step="0.01"
                      value={planExecution.payment_amount}
                      onChange={(e) => setPlanExecution({ ...planExecution, payment_amount: e.target.value })}
                      placeholder="أدخل المبلغ المدفوع (اختياري)"
                      className="h-9"
                    />
                  </div>
                  <div>
                    <Label htmlFor="payment_currency" className="text-sm">العملة</Label>
                    <Select value={planExecution.payment_currency} onValueChange={(value) => setPlanExecution({ ...planExecution, payment_currency: value })}>
                      <SelectTrigger className="h-9">
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

              {planTreatmentSteps && planTreatmentSteps.length > 0 && (
                <div>
                  <Label className="text-sm">خطوات العلاج</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto mt-2">
                    {planTreatmentSteps.map((step) => (
                      <div
                        key={step.id}
                        className={`flex items-start space-x-2 p-2 border rounded transition-colors ${selectedSteps.includes(step.id) ? 'bg-blue-50 border-blue-200' : 'bg-card'
                          }`}
                      >
                        <Checkbox
                          id={`plan-step-${step.id}`}
                          checked={selectedSteps.includes(step.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedSteps([...selectedSteps, step.id]);
                            } else {
                              setSelectedSteps(selectedSteps.filter(id => id !== step.id));
                            }
                          }}
                          className="mt-0.5"
                        />
                        <div className="flex-1">
                          <Label
                            htmlFor={`plan-step-${step.id}`}
                            className="cursor-pointer text-xs font-medium block leading-tight"
                          >
                            {step.step_order}. {step.step_name}
                          </Label>
                          {step.step_description && (
                            <p className="text-xs text-muted-foreground mt-0.5 leading-tight">
                              {step.step_description}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    اختر الخطوات المكتملة في هذا الموعد ({selectedSteps.length} محددة)
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="notes" className="text-sm">ملاحظات الموعد</Label>
                  <Textarea
                    id="notes"
                    value={planExecution.notes}
                    onChange={(e) => setPlanExecution({ ...planExecution, notes: e.target.value })}
                    placeholder="أدخل ملاحظات الموعد..."
                    rows={2}
                    className="text-sm resize-none"
                  />
                </div>
                <div>
                  <Label htmlFor="plan_treatment_notes" className="text-sm">ملاحظات العلاج</Label>
                  <Textarea
                    id="plan_treatment_notes"
                    value={planExecution.treatment_notes}
                    onChange={(e) => setPlanExecution({ ...planExecution, treatment_notes: e.target.value })}
                    placeholder="أدخل ملاحظات العلاج..."
                    rows={2}
                    className="text-sm resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button type="submit" disabled={executePlanMutation.isPending} className="flex-1 h-9">
                  {executePlanMutation.isPending ? "جاري التنفيذ..." : "تنفيذ الخطة"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsExecutePlanDetailsDialogOpen(false);
                    setIsExecutePlanDialogOpen(true);
                  }}
                  className="h-9"
                >
                  رجوع
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
