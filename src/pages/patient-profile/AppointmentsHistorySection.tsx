import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreditCard, Edit } from "lucide-react";
import { format } from "date-fns";
import { useUserRole } from "@/hooks/useUserRole";
import type { Appointment } from "@/api/clinic";

interface AppointmentsHistorySectionProps {
  appointments: Appointment[] | undefined;
  setSelectedAppointmentId: Dispatch<SetStateAction<string>>;
  setIsPaymentDialogOpen: Dispatch<SetStateAction<boolean>>;
  setEditingPayments: Dispatch<SetStateAction<{ [key: string]: string }>>;
  setIsEditPaymentDialogOpen: Dispatch<SetStateAction<boolean>>;
}

/** "تاريخ المواعيد" card with the add / edit payment buttons per appointment. */
export function AppointmentsHistorySection({
  appointments,
  setSelectedAppointmentId,
  setIsPaymentDialogOpen,
  setEditingPayments,
  setIsEditPaymentDialogOpen,
}: AppointmentsHistorySectionProps) {
  const { canManagePayments } = useUserRole();

  return (
    <Card>
      <CardHeader>
        <CardTitle>تاريخ المواعيد</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">التاريخ</TableHead>
              <TableHead className="text-right">الطبيب</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-right">العلاجات</TableHead>
              <TableHead className="text-right">المدفوعات</TableHead>
              <TableHead className="text-right">الملاحظات</TableHead>
              <TableHead className="text-right">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {appointments?.map((appointment) => (
              <TableRow key={appointment.id}>
                <TableCell>
                  {format(new Date(appointment.scheduled_at), 'dd/MM/yyyy')}
                </TableCell>
                <TableCell>{appointment.doctor?.full_name}</TableCell>
                <TableCell>
                  <span className={`px-2 py-1 rounded text-xs ${
                    appointment.status === 'Completed' ? 'bg-green-100 text-green-800' :
                    appointment.status === 'Scheduled' ? 'bg-blue-100 text-blue-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {appointment.status === 'Completed' ? 'مكتمل' :
                     appointment.status === 'Scheduled' ? 'مجدول' : 'ملغي'}
                  </span>
                </TableCell>
                <TableCell>
                  {appointment.treatment_records?.map((record, index) => (
                    <div key={index} className="text-sm">
                      {record.treatment?.name} - {record.sub_treatment?.name} (السن {record.tooth_number})
                    </div>
                  ))}
                </TableCell>
                <TableCell>
                  {appointment.payments?.map((payment, index) => (
                    <div key={index} className="text-sm">
                      {Math.round(payment.amount).toLocaleString('en-US')} {payment.currency === 'USD' ? '$' : 'ل.س'} بتاريخ {format(new Date(payment.paid_at), 'dd/MM/yyyy')}
                    </div>
                  ))}
                </TableCell>
                <TableCell>
                  <div className="text-sm text-muted-foreground">
                    {appointment.notes || '-'}
                  </div>
                </TableCell>
                <TableCell>
                  {canManagePayments && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedAppointmentId(appointment.id);
                          setIsPaymentDialogOpen(true);
                        }}
                      >
                        <CreditCard className="h-4 w-4 ml-1" />
                        إضافة دفعة
                      </Button>
                      {appointment.payments && appointment.payments.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedAppointmentId(appointment.id);
                            setEditingPayments({});
                            setIsEditPaymentDialogOpen(true);
                          }}
                        >
                          <Edit className="h-4 w-4 ml-1" />
                          تعديل دفعة
                        </Button>
                      )}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
