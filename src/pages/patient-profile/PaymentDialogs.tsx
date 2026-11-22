import { useState, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { appointmentsApi, moneyApi, type Currency } from "@/api/clinic";

interface PaymentDialogsProps {
  selectedAppointmentId: string;
  isPaymentDialogOpen: boolean;
  setIsPaymentDialogOpen: Dispatch<SetStateAction<boolean>>;
  isEditPaymentDialogOpen: boolean;
  setIsEditPaymentDialogOpen: Dispatch<SetStateAction<boolean>>;
  editingPayments: { [key: string]: string };
  setEditingPayments: Dispatch<SetStateAction<{ [key: string]: string }>>;
  invalidatePatientMoney: () => void;
  showError: (e: unknown) => void;
}

/** Record-payment and edit-payments dialogs for the appointment chosen in the history table. */
export function PaymentDialogs({
  selectedAppointmentId,
  isPaymentDialogOpen,
  setIsPaymentDialogOpen,
  isEditPaymentDialogOpen,
  setIsEditPaymentDialogOpen,
  editingPayments,
  setEditingPayments,
  invalidatePatientMoney,
  showError,
}: PaymentDialogsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [newPayment, setNewPayment] = useState({
    amount: "",
    currency: "SYP" as Currency,
  });

  const createPaymentMutation = useMutation({
    mutationFn: (payment: typeof newPayment) =>
      moneyApi.addPayment({
        appointment_id: selectedAppointmentId,
        amount: parseFloat(payment.amount),
        currency: payment.currency,
      }),
    onSuccess: () => {
      invalidatePatientMoney();
      queryClient.invalidateQueries({ queryKey: ["appointment-payments", selectedAppointmentId] });
      setIsPaymentDialogOpen(false);
      setNewPayment({ amount: "", currency: "SYP" });
      toast({ title: "نجح", description: "تم تسجيل الدفعة بنجاح" });
    },
    onError: showError,
  });

  // Fetch payments for a specific appointment
  const { data: appointmentPayments } = useQuery({
    queryKey: ["appointment-payments", selectedAppointmentId],
    queryFn: () => appointmentsApi.payments(selectedAppointmentId),
    enabled: !!selectedAppointmentId,
  });

  // Update payment mutation
  const updatePaymentMutation = useMutation({
    mutationFn: ({ paymentId, newAmount }: { paymentId: string; newAmount: number }) =>
      moneyApi.updatePayment(paymentId, newAmount),
    onSuccess: () => {
      invalidatePatientMoney();
      queryClient.invalidateQueries({ queryKey: ["appointment-payments", selectedAppointmentId] });
      toast({ title: "نجح", description: "تم تعديل الدفعة بنجاح" });
    },
    onError: showError,
  });

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    createPaymentMutation.mutate(newPayment);
  };

  return (
    <>
      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تسجيل دفعة</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRecordPayment} className="space-y-4">
            <div>
              <Label htmlFor="amount">مبلغ الدفعة</Label>
              <div className="flex gap-2">
                <Input
                  id="amount"
                  type="text"
                  className="flex-1"
                  value={newPayment.amount ? Math.round(Number(newPayment.amount)).toLocaleString('en-US') : ''}
                  onChange={(e) => {
                    const value = e.target.value.replace(/,/g, '');
                    if (value === '' || /^\d+$/.test(value)) {
                      setNewPayment({ ...newPayment, amount: value });
                    }
                  }}
                  required
                />
                <Select 
                  value={newPayment.currency} 
                  onValueChange={(value: "SYP" | "USD") => setNewPayment({ ...newPayment, currency: value })}
                >
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
            <Button type="submit" disabled={createPaymentMutation.isPending}>
              {createPaymentMutation.isPending ? "جاري التسجيل..." : "تسجيل الدفعة"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Payment Dialog */}
      <Dialog open={isEditPaymentDialogOpen} onOpenChange={setIsEditPaymentDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>تعديل الدفعات</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {appointmentPayments && appointmentPayments.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">تاريخ الدفع</TableHead>
                    <TableHead className="text-right">المبلغ الحالي</TableHead>
                    <TableHead className="text-right">العملة</TableHead>
                    <TableHead className="text-right">المبلغ الجديد</TableHead>
                    <TableHead className="text-right">إجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appointmentPayments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        {format(new Date(payment.paid_at), 'dd/MM/yyyy')}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {payment.currency === 'USD' ? '$' : ''}{Math.round(payment.amount).toLocaleString('en-US')}{payment.currency !== 'USD' ? ' ل.س' : ''}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${payment.currency === 'USD' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                          {payment.currency === 'USD' ? 'دولار' : 'ليرة'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="text"
                          placeholder="أدخل المبلغ الجديد"
                          value={editingPayments[payment.id] || ""}
                          onChange={(e) => {
                            const value = e.target.value.replace(/[^\d]/g, '');
                            const formatted = value ? parseInt(value).toLocaleString('en-US') : '';
                            setEditingPayments({
                              ...editingPayments,
                              [payment.id]: formatted
                            });
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          disabled={!editingPayments[payment.id] || updatePaymentMutation.isPending}
                          onClick={() => {
                            if (editingPayments[payment.id]) {
                              const numericValue = parseInt(editingPayments[payment.id].replace(/,/g, ''));
                              updatePaymentMutation.mutate({
                                paymentId: payment.id,
                                newAmount: numericValue
                              });
                            }
                          }}
                        >
                          حفظ
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>لا توجد دفعات لهذا الموعد</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
