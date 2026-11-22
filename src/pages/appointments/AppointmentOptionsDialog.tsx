import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, MessageCircle, CheckSquare, Pencil, Trash2, ClipboardCheck, CreditCard } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { useQueryClient } from "@tanstack/react-query";
import { appointmentsApi, apiErrorMessage, type Appointment, type AppointmentStatus } from "@/api/clinic";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface AppointmentOptionsDialogProps {
  showOptionsMenu: boolean;
  setShowOptionsMenu: Dispatch<SetStateAction<boolean>>;
  selectedAppointment: Appointment | null;
  setIsRecordDialogOpen: Dispatch<SetStateAction<boolean>>;
  setIsExecutePlanDialogOpen: Dispatch<SetStateAction<boolean>>;
  setIsResumeDialogOpen: Dispatch<SetStateAction<boolean>>;
  setIsAddPaymentDialogOpen: Dispatch<SetStateAction<boolean>>;
  sendWhatsAppMessage: (appointment: Appointment) => void;
  openEditAppointment: (appointment: Appointment) => void;
  deleteAppointmentMutation: { mutate: (appointmentId: string) => void };
}

/** "خيارات الموعد" dialog opened by clicking a table row. */
export function AppointmentOptionsDialog({
  showOptionsMenu,
  setShowOptionsMenu,
  selectedAppointment,
  setIsRecordDialogOpen,
  setIsExecutePlanDialogOpen,
  setIsResumeDialogOpen,
  setIsAddPaymentDialogOpen,
  sendWhatsAppMessage,
  openEditAppointment,
  deleteAppointmentMutation,
}: AppointmentOptionsDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canManagePayments } = useUserRole();

  const updateAppointmentStatus = async (appointmentId: string, status: AppointmentStatus) => {
    try {
      await appointmentsApi.update(appointmentId, { status });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast({ title: "Success", description: "Appointment updated successfully" });
    } catch (e) {
      toast({ title: "Error", description: apiErrorMessage(e), variant: "destructive" });
    }
  };

  return (
    <Dialog open={showOptionsMenu} onOpenChange={setShowOptionsMenu}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>خيارات الموعد</DialogTitle>
        </DialogHeader>
        {selectedAppointment && (
          <div className="space-y-4">
            {/* معلومات الموعد في عامودين */}
            <div className="grid grid-cols-2 gap-3 text-sm p-3 bg-muted/50 rounded-lg">
              <div><span className="font-medium">المريض:</span> {selectedAppointment.patient?.full_name}</div>
              <div><span className="font-medium">الطبيب:</span> {selectedAppointment.doctor?.full_name}</div>
              <div><span className="font-medium">التاريخ:</span> {format(new Date(selectedAppointment.scheduled_at), 'dd/MM/yyyy')}</div>
              <div><span className="font-medium">الوقت:</span> {new Date(selectedAppointment.scheduled_at).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}</div>
              <div className="col-span-2">
                <span className="font-medium">الحالة:</span>{" "}
                <span className={`px-2 py-1 rounded text-xs ${selectedAppointment.status === 'Completed' ? 'bg-green-100 text-green-800' :
                  selectedAppointment.status === 'Scheduled' ? 'bg-blue-100 text-blue-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                  {selectedAppointment.status === 'Completed' ? 'مكتمل' :
                    selectedAppointment.status === 'Scheduled' ? 'مجدول' : 'ملغي'}
                </span>
              </div>
              {selectedAppointment.notes && (
                <div className="col-span-2"><span className="font-medium">ملاحظات:</span> {selectedAppointment.notes}</div>
              )}
            </div>

            {/* الخيارات في عامودين */}
            <div className="grid grid-cols-2 gap-2">
              {selectedAppointment.status === 'Scheduled' && (
                <>
                  <Button
                    variant="outline"
                    className="justify-start"
                    onClick={() => {
                      setIsRecordDialogOpen(true);
                      setShowOptionsMenu(false);
                    }}
                  >
                    <FileText className="h-4 w-4 ml-1" />
                    تسجيل علاج
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start"
                    onClick={() => {
                      setIsExecutePlanDialogOpen(true);
                      setShowOptionsMenu(false);
                    }}
                  >
                    <ClipboardCheck className="h-4 w-4 ml-1" />
                    تنفيذ خطة علاج
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start"
                    onClick={() => {
                      setIsResumeDialogOpen(true);
                      setShowOptionsMenu(false);
                    }}
                  >
                    <CheckSquare className="h-4 w-4 ml-1" />
                    استكمال علاج
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start"
                    onClick={() => {
                      updateAppointmentStatus(selectedAppointment.id, 'Completed');
                      setShowOptionsMenu(false);
                    }}
                  >
                    تمييز كمكتمل
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start"
                    onClick={() => {
                      updateAppointmentStatus(selectedAppointment.id, 'Cancelled');
                      setShowOptionsMenu(false);
                    }}
                  >
                    إلغاء الموعد
                  </Button>
                </>
              )}
              {canManagePayments && (
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => {
                    setIsAddPaymentDialogOpen(true);
                    setShowOptionsMenu(false);
                  }}
                >
                  <CreditCard className="h-4 w-4 ml-1" />
                  إضافة دفعة
                </Button>
              )}
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => {
                  sendWhatsAppMessage(selectedAppointment);
                  setShowOptionsMenu(false);
                }}
              >
                <MessageCircle className="h-4 w-4 ml-1" />
                إرسال واتساب
              </Button>
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => {
                  window.open(`/patient-profile/${selectedAppointment.patient_id}`, '_blank');
                  setShowOptionsMenu(false);
                }}
              >
                عرض ملف المريض
              </Button>
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => {
                  openEditAppointment(selectedAppointment);
                  setShowOptionsMenu(false);
                }}
              >
                <Pencil className="h-4 w-4 ml-1" />
                تعديل الموعد
              </Button>
              <Button
                variant="outline"
                className="justify-start text-destructive hover:text-destructive"
                onClick={() => {
                  if (confirm("هل أنت متأكد من حذف هذا الموعد؟")) {
                    deleteAppointmentMutation.mutate(selectedAppointment.id);
                    setShowOptionsMenu(false);
                  }
                }}
              >
                <Trash2 className="h-4 w-4 ml-1" />
                حذف الموعد
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
