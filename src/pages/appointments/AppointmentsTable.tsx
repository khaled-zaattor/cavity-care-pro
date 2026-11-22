import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FileText, MessageCircle, CheckSquare, MoreHorizontal, Pencil, Trash2, ClipboardCheck } from "lucide-react";
import type { Appointment, Paginated } from "@/api/clinic";
import { useIsMobile } from "@/hooks/use-mobile";
import { format } from "date-fns";

interface AppointmentsTableProps {
  isLoading: boolean;
  appointments: Appointment[] | undefined;
  appointmentsPage: Paginated<Appointment> | undefined;
  lastPage: number;
  page: number;
  setPage: Dispatch<SetStateAction<number>>;
  visibleTableColumns: string[];
  specialtyName: (apt: Appointment) => string;
  setSelectedAppointment: Dispatch<SetStateAction<Appointment | null>>;
  setShowOptionsMenu: Dispatch<SetStateAction<boolean>>;
  setIsRecordDialogOpen: Dispatch<SetStateAction<boolean>>;
  setIsExecutePlanDialogOpen: Dispatch<SetStateAction<boolean>>;
  setIsResumeDialogOpen: Dispatch<SetStateAction<boolean>>;
  sendWhatsAppMessage: (appointment: Appointment) => void;
  openEditAppointment: (appointment: Appointment) => void;
  deleteAppointmentMutation: { mutate: (appointmentId: string) => void };
}

/** Appointments table (row click opens the options menu) + pagination. */
export function AppointmentsTable({
  isLoading,
  appointments,
  appointmentsPage,
  lastPage,
  page,
  setPage,
  visibleTableColumns,
  specialtyName,
  setSelectedAppointment,
  setShowOptionsMenu,
  setIsRecordDialogOpen,
  setIsExecutePlanDialogOpen,
  setIsResumeDialogOpen,
  sendWhatsAppMessage,
  openEditAppointment,
  deleteAppointmentMutation,
}: AppointmentsTableProps) {
  const isMobile = useIsMobile();

  return (
    <>
      {isLoading ? (
        <div>جاري تحميل المواعيد...</div>
      ) : (
        <div className="relative max-h-[calc(100vh-16rem)] overflow-y-auto">
          <table className="w-full caption-bottom text-sm">
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                {visibleTableColumns.includes('date_time') && (
                  <TableHead className="text-right w-[180px]">التاريخ والوقت</TableHead>
                )}
                {visibleTableColumns.includes('patient_name') && (
                  <TableHead className="text-right w-[180px]">اسم المريض</TableHead>
                )}
                {visibleTableColumns.includes('doctor_info') && (
                  <TableHead className="hidden md:table-cell text-right">الطبيب</TableHead>
                )}
                {visibleTableColumns.includes('status') && (
                  <TableHead className="hidden md:table-cell text-right w-[100px]">الحالة</TableHead>
                )}
                {visibleTableColumns.includes('notes') && (
                  <TableHead className="hidden lg:table-cell text-right w-[240px]">ملاحظات</TableHead>
                )}
                {visibleTableColumns.includes('actions') && (
                  <TableHead className="hidden lg:table-cell text-right">الإجراءات</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {appointments?.map((appointment) => (
                <TableRow
                  key={appointment.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => {
                    setSelectedAppointment(appointment);
                    setShowOptionsMenu(true);
                  }}
                >
                  {visibleTableColumns.includes('date_time') && (
                    <TableCell className="whitespace-nowrap">
                      {/* Date over time: "date - time" on one line got reordered by bidi
                          and mixed Latin with Arabic-Indic digits. */}
                      <div className="tabular-nums">{format(new Date(appointment.scheduled_at), 'dd/MM/yyyy')}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {new Date(appointment.scheduled_at).toLocaleTimeString('ar-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </TableCell>
                  )}
                  {visibleTableColumns.includes('patient_name') && (
                    <TableCell>{appointment.patient?.full_name}</TableCell>
                  )}
                  {visibleTableColumns.includes('doctor_info') && (
                    <TableCell className="hidden md:table-cell whitespace-nowrap">
                      {appointment.doctor?.full_name}
                      <br />
                      <span className="text-xs text-muted-foreground">
                        {specialtyName(appointment)}
                      </span>
                    </TableCell>
                  )}
                  {visibleTableColumns.includes('status') && (
                    <TableCell className="hidden md:table-cell">
                      <span className={`px-2 py-1 rounded text-xs ${appointment.status === 'Completed' ? 'bg-green-100 text-green-800' :
                        appointment.status === 'Scheduled' ? 'bg-blue-100 text-blue-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                        {appointment.status === 'Completed' ? 'مكتمل' :
                          appointment.status === 'Scheduled' ? 'مجدول' : 'ملغي'}
                      </span>
                    </TableCell>
                  )}
                  {visibleTableColumns.includes('notes') && (
                    <TableCell className="hidden lg:table-cell">{appointment.notes || "-"}</TableCell>
                  )}
                  {visibleTableColumns.includes('actions') && (
                    <TableCell className="hidden lg:table-cell" onClick={(e) => e.stopPropagation()}>
                      {isMobile ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm">
                              <MoreHorizontal className="h-4 w-4 ml-1" />
                              خيارات
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            {appointment.status === 'Scheduled' && (
                              <>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedAppointment(appointment);
                                    setIsRecordDialogOpen(true);
                                  }}
                                >
                                  <FileText className="h-4 w-4 ml-1" />
                                  تسجيل علاج
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedAppointment(appointment);
                                    setIsExecutePlanDialogOpen(true);
                                  }}
                                >
                                  <ClipboardCheck className="h-4 w-4 ml-1" />
                                  تنفيذ خطة علاج
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedAppointment(appointment);
                                    setIsResumeDialogOpen(true);
                                  }}
                                >
                                  <CheckSquare className="h-4 w-4 ml-1" />
                                  استكمال علاج
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuItem
                              onClick={() => sendWhatsAppMessage(appointment)}
                            >
                              <MessageCircle className="h-4 w-4 ml-1" />
                              واتساب
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => window.open(`/patient-profile/${appointment.patient_id}`, '_blank')}
                            >
                              عرض المريض
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => openEditAppointment(appointment)}
                            >
                              <Pencil className="h-4 w-4 ml-1" />
                              تعديل
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                if (confirm("هل أنت متأكد من حذف هذا الموعد؟")) {
                                  deleteAppointmentMutation.mutate(appointment.id);
                                }
                              }}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 ml-1" />
                              حذف
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <div className="flex space-x-2">
                          {appointment.status === 'Scheduled' && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedAppointment(appointment);
                                  setIsRecordDialogOpen(true);
                                }}
                              >

                                تسجيل علاج
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedAppointment(appointment);
                                  setIsExecutePlanDialogOpen(true);
                                }}
                                className="text-blue-600 hover:text-blue-700"
                              >

                                تنفيذ خطة علاج
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedAppointment(appointment);
                                  setIsResumeDialogOpen(true);
                                }}
                                className="text-orange-600 hover:text-orange-700"
                              >

                                استكمال علاج
                              </Button>
                            </>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => sendWhatsAppMessage(appointment)}
                            className="text-green-600 hover:text-green-700"
                          >
                            <MessageCircle className="h-4 w-4 ml-1" />

                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(`/patient-profile/${appointment.patient_id}`, '_blank')}
                          >
                            عرض المريض
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </table>
        </div>
      )}
      {!isLoading && appointmentsPage && (
        <div className="flex items-center justify-between gap-2 pt-4 text-sm">
          <span className="text-muted-foreground">
            صفحة {appointmentsPage.current_page} من {lastPage} ({appointmentsPage.total} موعد)
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              السابق
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
              disabled={page >= lastPage}
            >
              التالي
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
