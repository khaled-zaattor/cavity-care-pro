import { useState, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { moneyApi, apiErrorMessage, type Appointment, type Currency } from "@/api/clinic";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { format } from "date-fns";

interface AddPaymentDialogProps {
  isAddPaymentDialogOpen: boolean;
  setIsAddPaymentDialogOpen: Dispatch<SetStateAction<boolean>>;
  selectedAppointment: Appointment | null;
}

/** "إضافة دفعة" dialog for the selected appointment (toast offers the receipt). */
export function AddPaymentDialog({
  isAddPaymentDialogOpen,
  setIsAddPaymentDialogOpen,
  selectedAppointment,
}: AddPaymentDialogProps) {
  const [newPaymentAmount, setNewPaymentAmount] = useState("");
  const [newPaymentCurrency, setNewPaymentCurrency] = useState("SYP");

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Mutation to add payment
  const addPaymentMutation = useMutation({
    mutationFn: ({ appointmentId, amount, currency }: { appointmentId: string; amount: number; currency: string }) =>
      moneyApi.addPayment({ appointment_id: appointmentId, amount, currency: currency as Currency }),
    onSuccess: (payment) => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      setIsAddPaymentDialogOpen(false);
      setNewPaymentAmount("");
      setNewPaymentCurrency("SYP");
      // The receipt opens only from this click (pop-up blockers).
      toast({
        title: "نجح",
        description: "تم تسجيل الدفعة بنجاح",
        duration: 15000,
        action: payment?.id ? (
          <ToastAction altText="طباعة الإيصال" onClick={() => window.open(`/print/receipt/${payment.id}`, "_blank")}>
            طباعة الإيصال
          </ToastAction>
        ) : undefined,
      });
    },
    onError: (e) => {
      toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" });
    },
  });

  const handleAddPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppointment || !newPaymentAmount) return;
    const amount = parseFloat(newPaymentAmount.replace(/,/g, ''));
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "خطأ", description: "يرجى إدخال مبلغ صحيح", variant: "destructive" });
      return;
    }
    addPaymentMutation.mutate({ appointmentId: selectedAppointment.id, amount, currency: newPaymentCurrency });
  };

  return (
    <Dialog open={isAddPaymentDialogOpen} onOpenChange={setIsAddPaymentDialogOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>إضافة دفعة</DialogTitle>
        </DialogHeader>
        {selectedAppointment && (
          <div className="space-y-4">
            <div className="text-sm p-3 bg-muted/50 rounded-lg space-y-1">
              <div><span className="font-medium">المريض:</span> {selectedAppointment.patient?.full_name}</div>
              <div><span className="font-medium">التاريخ:</span> {format(new Date(selectedAppointment.scheduled_at), 'dd/MM/yyyy')}</div>
            </div>
            <form onSubmit={handleAddPayment} className="space-y-4">
              <div>
                <Label htmlFor="payment-amount">مبلغ الدفعة</Label>
                <div className="flex gap-2">
                  <Input
                    id="payment-amount"
                    type="text"
                    className="flex-1"
                    value={newPaymentAmount ? parseInt(newPaymentAmount.replace(/,/g, '')).toLocaleString('en-US') : ''}
                    onChange={(e) => {
                      const value = e.target.value.replace(/,/g, '');
                      if (value === '' || /^\d+$/.test(value)) {
                        setNewPaymentAmount(value);
                      }
                    }}
                    placeholder="أدخل المبلغ"
                    required
                  />
                  <Select value={newPaymentCurrency} onValueChange={setNewPaymentCurrency}>
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SYP">ل.س</SelectItem>
                      <SelectItem value="USD">$</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsAddPaymentDialogOpen(false);
                    setNewPaymentAmount("");
                    setNewPaymentCurrency("SYP");
                  }}
                >
                  إلغاء
                </Button>
                <Button type="submit" disabled={addPaymentMutation.isPending}>
                  {addPaymentMutation.isPending ? "جاري التسجيل..." : "تسجيل الدفعة"}
                </Button>
              </div>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
