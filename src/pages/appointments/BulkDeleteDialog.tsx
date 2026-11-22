import { useState, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { useQueryClient } from "@tanstack/react-query";
import {
  appointmentsApi,
  apiErrorMessage,
  dayStartIso,
  dayEndIso,
  type Appointment,
  type Payment,
  type TreatmentRecord,
} from "@/api/clinic";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface BulkDeletePreview {
  appointments: Appointment[];
  payments: Payment[];
  treatment_records: TreatmentRecord[];
  totals: { payments_syp: number; payments_usd: number };
}

interface BulkDeleteDialogProps {
  isBulkDeleteDialogOpen: boolean;
  setIsBulkDeleteDialogOpen: Dispatch<SetStateAction<boolean>>;
  specialtyName: (apt: Appointment) => string;
}

/** Delete appointments between two dates: date dialog + confirmation (exports the deleted data to Excel first). */
export function BulkDeleteDialog({
  isBulkDeleteDialogOpen,
  setIsBulkDeleteDialogOpen,
  specialtyName,
}: BulkDeleteDialogProps) {
  const [bulkDeleteStartDate, setBulkDeleteStartDate] = useState("");
  const [bulkDeleteEndDate, setBulkDeleteEndDate] = useState("");
  const [bulkDeletePreview, setBulkDeletePreview] = useState<BulkDeletePreview | null>(null);
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Function to preview bulk delete data
  const previewBulkDelete = async () => {
    if (!bulkDeleteStartDate || !bulkDeleteEndDate) {
      toast({ title: "خطأ", description: "يرجى تحديد تاريخ البداية والنهاية", variant: "destructive" });
      return;
    }

    try {
      const preview = await appointmentsApi.bulkDeletePreview(dayStartIso(bulkDeleteStartDate), dayEndIso(bulkDeleteEndDate));

      if (!preview.appointments || preview.appointments.length === 0) {
        toast({ title: "لا توجد مواعيد", description: "لا توجد مواعيد في هذا النطاق الزمني", variant: "destructive" });
        return;
      }

      setBulkDeletePreview(preview);
      setIsBulkDeleteConfirmOpen(true);
    } catch (e) {
      toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" });
    }
  };

  // Function to export deleted data and perform bulk delete
  const executeBulkDelete = async () => {
    if (!bulkDeletePreview) return;

    const { appointments: appointmentsToDelete, payments: paymentsToDelete, treatment_records: treatmentsToDelete } = bulkDeletePreview;

    // Create Excel workbook with deleted data
    const wb = XLSX.utils.book_new();

    // Appointments sheet
    if (appointmentsToDelete.length > 0) {
      const appointmentsData = appointmentsToDelete.map((apt) => ({
        'التاريخ': format(new Date(apt.scheduled_at), 'dd/MM/yyyy'),
        'الوقت': new Date(apt.scheduled_at).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }),
        'اسم المريض': apt.patient?.full_name || '-',
        'رقم الهاتف': apt.patient?.phone_number || '-',
        'الطبيب': apt.doctor?.full_name || '-',
        'التخصص': specialtyName(apt) || '-',
        'الحالة': apt.status === 'Completed' ? 'مكتمل' : apt.status === 'Scheduled' ? 'مجدول' : 'ملغي',
        'ملاحظات': apt.notes || '-',
      }));
      const ws1 = XLSX.utils.json_to_sheet(appointmentsData);
      XLSX.utils.book_append_sheet(wb, ws1, 'المواعيد المحذوفة');
    }

    // Payments sheet
    if (paymentsToDelete.length > 0) {
      const paymentsData = paymentsToDelete.map((pay) => ({
        'تاريخ الدفع': format(new Date(pay.paid_at), 'dd/MM/yyyy'),
        'المبلغ': pay.amount,
        'العملة': pay.currency === 'USD' ? '$' : 'ل.س',
        'اسم المريض': pay.appointment?.patient?.full_name || '-',
        'تاريخ الموعد': pay.appointment?.scheduled_at ? format(new Date(pay.appointment.scheduled_at), 'dd/MM/yyyy') : '-',
      }));
      const ws2 = XLSX.utils.json_to_sheet(paymentsData);
      XLSX.utils.book_append_sheet(wb, ws2, 'الدفعات المحذوفة');
    }

    // Treatment records sheet
    if (treatmentsToDelete.length > 0) {
      const treatmentsData = treatmentsToDelete.map((tr) => ({
        'تاريخ العلاج': format(new Date(tr.performed_at), 'dd/MM/yyyy'),
        'اسم المريض': tr.appointment?.patient?.full_name || '-',
        'العلاج': tr.treatment?.name || '-',
        'العلاج الفرعي': tr.sub_treatment?.name || '-',
        'رقم السن': tr.tooth_number || '-',
        'التكلفة (ل.س)': tr.actual_cost_syp ?? '-',
        'التكلفة ($)': tr.actual_cost_usd ?? '-',
        'ملاحظات العلاج': tr.treatment_notes || '-',
        'الحالة': tr.is_completed ? 'مكتمل' : 'جاري',
      }));
      const ws3 = XLSX.utils.json_to_sheet(treatmentsData);
      XLSX.utils.book_append_sheet(wb, ws3, 'العلاجات المحذوفة');
    }

    // Save Excel file
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const fileName = `البيانات_المحذوفة_${format(new Date(bulkDeleteStartDate), 'dd-MM-yyyy')}_إلى_${format(new Date(bulkDeleteEndDate), 'dd-MM-yyyy')}.xlsx`;
    saveAs(blob, fileName);

    // The server deletes the appointments and everything linked to them
    let deleted = appointmentsToDelete.length;
    try {
      const res = await appointmentsApi.bulkDelete(dayStartIso(bulkDeleteStartDate), dayEndIso(bulkDeleteEndDate));
      deleted = res.deleted;
    } catch (e) {
      toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" });
      return;
    }

    // Reset and close dialogs
    queryClient.invalidateQueries({ queryKey: ["appointments"] });
    setIsBulkDeleteConfirmOpen(false);
    setIsBulkDeleteDialogOpen(false);
    setBulkDeletePreview(null);
    setBulkDeleteStartDate("");
    setBulkDeleteEndDate("");

    toast({
      title: "تم الحذف بنجاح",
      description: `تم حذف ${deleted} موعد و ${paymentsToDelete.length} دفعة و ${treatmentsToDelete.length} سجل علاج وتصدير البيانات`
    });
  };

  return (
    <>
      {/* Bulk Delete Dialog */}
      <Dialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">حذف مواعيد بين تاريخين</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              سيتم حذف جميع المواعيد والدفعات والعلاجات المسجلة بين التاريخين المحددين. سيتم تصدير ملف Excel يحتوي على جميع البيانات المحذوفة قبل الحذف.
            </p>
            <div className="grid gap-4">
              <div>
                <Label htmlFor="bulk-delete-start">تاريخ البداية</Label>
                <Input
                  id="bulk-delete-start"
                  type="date"
                  value={bulkDeleteStartDate}
                  onChange={(e) => setBulkDeleteStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="bulk-delete-end">تاريخ النهاية</Label>
                <Input
                  id="bulk-delete-end"
                  type="date"
                  value={bulkDeleteEndDate}
                  onChange={(e) => setBulkDeleteEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => {
                setIsBulkDeleteDialogOpen(false);
                setBulkDeleteStartDate("");
                setBulkDeleteEndDate("");
              }}>
                إلغاء
              </Button>
              <Button
                variant="destructive"
                onClick={previewBulkDelete}
                disabled={!bulkDeleteStartDate || !bulkDeleteEndDate}
              >
                معاينة الحذف
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={isBulkDeleteConfirmOpen} onOpenChange={setIsBulkDeleteConfirmOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">تأكيد الحذف الجماعي</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>أنت على وشك حذف البيانات التالية نهائياً:</p>
                {bulkDeletePreview && (
                  <div className="bg-muted p-3 rounded-lg space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>المواعيد:</span>
                      <span className="font-bold text-destructive">{bulkDeletePreview.appointments.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>الدفعات:</span>
                      <span className="font-bold text-destructive">{bulkDeletePreview.payments.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>سجلات العلاج:</span>
                      <span className="font-bold text-destructive">{bulkDeletePreview.treatment_records.length}</span>
                    </div>
                    {bulkDeletePreview.payments.length > 0 && (
                      <div className="border-t pt-2 mt-2 space-y-1">
                        {(bulkDeletePreview.totals.payments_syp > 0 || bulkDeletePreview.totals.payments_usd === 0) && (
                          <div className="flex justify-between">
                            <span>إجمالي المبالغ (ل.س):</span>
                            <span className="font-bold">
                              {bulkDeletePreview.totals.payments_syp.toLocaleString('en-US')} ل.س
                            </span>
                          </div>
                        )}
                        {bulkDeletePreview.totals.payments_usd > 0 && (
                          <div className="flex justify-between">
                            <span>إجمالي المبالغ ($):</span>
                            <span className="font-bold">
                              {bulkDeletePreview.totals.payments_usd.toLocaleString('en-US')} $
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <p className="text-destructive font-medium">
                  سيتم تصدير ملف Excel يحتوي على جميع البيانات قبل الحذف.
                </p>
                <p className="text-destructive font-bold">
                  هذا الإجراء لا يمكن التراجع عنه!
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={() => {
              setIsBulkDeleteConfirmOpen(false);
              setBulkDeletePreview(null);
            }}>
              إلغاء
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={executeBulkDelete}
            >
              تصدير وحذف نهائياً
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
