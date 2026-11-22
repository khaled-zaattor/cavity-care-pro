import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  appointmentsApi,
  doctorsApi,
  catalogApi,
  apiErrorMessage,
  dayStartIso,
  dayEndIso,
  type Appointment,
  type AppointmentFilters,
  type AppointmentStatus,
} from "@/api/clinic";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { availableTableColumns, emptyAppointmentForm, formatDateForInput } from "./appointments/utils";
import { AppointmentFormDialog } from "./appointments/AppointmentFormDialog";
import { AppointmentsToolbar } from "./appointments/AppointmentsToolbar";
import { AppointmentsTable } from "./appointments/AppointmentsTable";
import { RecordTreatmentDialog } from "./appointments/RecordTreatmentDialog";
import { ResumeTreatmentDialog } from "./appointments/ResumeTreatmentDialog";
import { ExecutePlanDialog } from "./appointments/ExecutePlanDialog";
import { AppointmentOptionsDialog } from "./appointments/AppointmentOptionsDialog";
import { ExportColumnsDialog } from "./appointments/ExportColumnsDialog";
import { ColumnSelectDialog } from "./appointments/ColumnSelectDialog";
import { BulkDeleteDialog } from "./appointments/BulkDeleteDialog";
import { AddPaymentDialog } from "./appointments/AddPaymentDialog";

export default function Appointments() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isRecordDialogOpen, setIsRecordDialogOpen] = useState(false);
  const [isResumeDialogOpen, setIsResumeDialogOpen] = useState(false);
  const [isExecutePlanDialogOpen, setIsExecutePlanDialogOpen] = useState(false);
  const [isExportColumnsDialogOpen, setIsExportColumnsDialogOpen] = useState(false);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [isAddPaymentDialogOpen, setIsAddPaymentDialogOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [selectedSteps, setSelectedSteps] = useState<string[]>([]);
  const [selectedPatientLabel, setSelectedPatientLabel] = useState("");
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [page, setPage] = useState(1);

  const [visibleTableColumns, setVisibleTableColumns] = useState<string[]>(() => {
    const saved = localStorage.getItem('appointments-visible-columns');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return availableTableColumns.map(col => col.id);
      }
    }
    return availableTableColumns.map(col => col.id);
  });

  // Save visible columns to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('appointments-visible-columns', JSON.stringify(visibleTableColumns));
  }, [visibleTableColumns]);

  const [isColumnSelectDialogOpen, setIsColumnSelectDialogOpen] = useState(false);

  // Filter states
  const [filterDoctor, setFilterDoctor] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPatientName, setFilterPatientName] = useState("");
  const [debouncedPatientName, setDebouncedPatientName] = useState("");

  const [newAppointment, setNewAppointment] = useState(emptyAppointmentForm);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Debounce patient name filter
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPatientName(filterPatientName);
    }, 500);

    return () => clearTimeout(timer);
  }, [filterPatientName]);

  // Back to the first page whenever the filters change
  useEffect(() => {
    setPage(1);
  }, [filterDoctor, filterStartDate, filterEndDate, filterStatus, debouncedPatientName]);

  // Server-side filters shared by the table and the Excel export
  const appointmentFilters: AppointmentFilters = {
    doctor_id: filterDoctor && filterDoctor !== "all" ? filterDoctor : undefined,
    status: filterStatus && filterStatus !== "all" ? (filterStatus as AppointmentStatus) : undefined,
    from: filterStartDate ? dayStartIso(filterStartDate) : undefined,
    to: filterEndDate ? dayEndIso(filterEndDate) : undefined,
    patient_name: debouncedPatientName.trim() || undefined,
  };

  const { data: appointmentsPage, isLoading } = useQuery({
    queryKey: ["appointments", filterDoctor, filterStartDate, filterEndDate, filterStatus, debouncedPatientName, page],
    queryFn: () => appointmentsApi.list({ ...appointmentFilters, page }),
    placeholderData: keepPreviousData,
  });
  const appointments = appointmentsPage?.data;
  const lastPage = appointmentsPage?.last_page ?? 1;

  const { data: doctors } = useQuery({
    queryKey: ["doctors"],
    queryFn: () => doctorsApi.list(),
  });

  // Specialty shown for an appointment: its own, else the doctor's primary one
  const specialtyName = (apt: Appointment) =>
    apt.specialty?.name_ar || doctors?.find((d) => d.id === apt.doctor_id)?.specialty || "";

  const { data: allTreatments } = useQuery({
    queryKey: ["treatments", "all-visible"],
    queryFn: () => catalogApi.list(),
  });

  const resetAppointmentForm = () => {
    setNewAppointment(emptyAppointmentForm);
    setSelectedPatientLabel("");
  };

  const deleteAppointmentMutation = useMutation({
    // The server also deletes the appointment's payments, records, steps, plans links...
    mutationFn: (appointmentId: string) => appointmentsApi.remove(appointmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast({ title: "نجح", description: "تم حذف الموعد بنجاح" });
    },
    onError: (e) => {
      toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" });
    },
  });

  const openEditAppointment = (appointment: Appointment) => {
    setEditingAppointment(appointment);
    setSelectedPatientLabel(appointment.patient?.full_name || "");
    setNewAppointment({
      patient_id: appointment.patient_id,
      doctor_id: appointment.doctor_id,
      specialty_id: appointment.specialty_id || "",
      scheduled_at: formatDateForInput(appointment.scheduled_at),
      notes: appointment.notes || "",
    });
    setIsDialogOpen(true);
  };

  const sendWhatsAppMessage = (appointment: Appointment) => {
    if (!appointment.patient?.phone_number) {
      toast({
        title: "خطأ",
        description: "رقم هاتف المريض غير متوفر",
        variant: "destructive"
      });
      return;
    }

    const appointmentDate = new Date(appointment.scheduled_at);
    const formattedDate = format(appointmentDate, 'dd/MM/yyyy');
    const formattedTime = appointmentDate.toLocaleTimeString('ar-SA', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const message = `مرحباً ${appointment.patient.full_name}،

نذكركم بموعدكم في العيادة:
📅 التاريخ: ${formattedDate}
🕐 الوقت: ${formattedTime}
👨‍⚕️ الطبيب: ${appointment.doctor?.full_name}
🏥 التخصص: ${specialtyName(appointment)}

${appointment.notes ? `📝 ملاحظات: ${appointment.notes}` : ''}

يرجى الحضور قبل الموعد بـ 15 دقيقة.

شكراً لكم`;

    const phoneNumber = appointment.patient.phone_number.replace(/[^0-9]/g, '');
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;

    window.open(whatsappUrl, '_blank');
  };

  return (
    <div className="space-y-6">


      <Card>
        {/* phone: search + new appointment on one row, tools below; desktop: all on one row */}
        <CardHeader className="flex flex-col lg:flex-row lg:items-center gap-3 space-y-0 pb-4">
          <div className="flex items-center gap-2 lg:flex-1 lg:max-w-md">
            <Input
              id="appointments-search"
              type="search"
              value={filterPatientName}
              onChange={(e) => setFilterPatientName(e.target.value)}
              placeholder="ابحث عن مريض..."
              className="flex-1 min-w-0"
              aria-label="بحث عن مريض"
            />
            <AppointmentFormDialog
              isDialogOpen={isDialogOpen}
              setIsDialogOpen={setIsDialogOpen}
              editingAppointment={editingAppointment}
              setEditingAppointment={setEditingAppointment}
              newAppointment={newAppointment}
              setNewAppointment={setNewAppointment}
              selectedPatientLabel={selectedPatientLabel}
              setSelectedPatientLabel={setSelectedPatientLabel}
              resetAppointmentForm={resetAppointmentForm}
              doctors={doctors}
            />
          </div>
          <AppointmentsToolbar
            filterDoctor={filterDoctor}
            setFilterDoctor={setFilterDoctor}
            filterStartDate={filterStartDate}
            setFilterStartDate={setFilterStartDate}
            filterEndDate={filterEndDate}
            setFilterEndDate={setFilterEndDate}
            filterStatus={filterStatus}
            setFilterStatus={setFilterStatus}
            filterPatientName={filterPatientName}
            setFilterPatientName={setFilterPatientName}
            doctors={doctors}
            setIsColumnSelectDialogOpen={setIsColumnSelectDialogOpen}
            setIsExportColumnsDialogOpen={setIsExportColumnsDialogOpen}
            setIsBulkDeleteDialogOpen={setIsBulkDeleteDialogOpen}
          />
        </CardHeader>
        <CardContent>
          <AppointmentsTable
            isLoading={isLoading}
            appointments={appointments}
            appointmentsPage={appointmentsPage}
            lastPage={lastPage}
            page={page}
            setPage={setPage}
            visibleTableColumns={visibleTableColumns}
            specialtyName={specialtyName}
            setSelectedAppointment={setSelectedAppointment}
            setShowOptionsMenu={setShowOptionsMenu}
            setIsRecordDialogOpen={setIsRecordDialogOpen}
            setIsExecutePlanDialogOpen={setIsExecutePlanDialogOpen}
            setIsResumeDialogOpen={setIsResumeDialogOpen}
            sendWhatsAppMessage={sendWhatsAppMessage}
            openEditAppointment={openEditAppointment}
            deleteAppointmentMutation={deleteAppointmentMutation}
          />
        </CardContent>
      </Card>

      <RecordTreatmentDialog
        isRecordDialogOpen={isRecordDialogOpen}
        setIsRecordDialogOpen={setIsRecordDialogOpen}
        selectedAppointment={selectedAppointment}
        doctors={doctors}
        allTreatments={allTreatments}
        selectedSteps={selectedSteps}
        setSelectedSteps={setSelectedSteps}
      />

      <ResumeTreatmentDialog
        isResumeDialogOpen={isResumeDialogOpen}
        setIsResumeDialogOpen={setIsResumeDialogOpen}
        selectedAppointment={selectedAppointment}
        allTreatments={allTreatments}
        selectedSteps={selectedSteps}
        setSelectedSteps={setSelectedSteps}
      />

      <ExecutePlanDialog
        isExecutePlanDialogOpen={isExecutePlanDialogOpen}
        setIsExecutePlanDialogOpen={setIsExecutePlanDialogOpen}
        selectedAppointment={selectedAppointment}
        allTreatments={allTreatments}
        selectedSteps={selectedSteps}
        setSelectedSteps={setSelectedSteps}
      />

      {/* Options Menu Dialog */}
      <AppointmentOptionsDialog
        showOptionsMenu={showOptionsMenu}
        setShowOptionsMenu={setShowOptionsMenu}
        selectedAppointment={selectedAppointment}
        setIsRecordDialogOpen={setIsRecordDialogOpen}
        setIsExecutePlanDialogOpen={setIsExecutePlanDialogOpen}
        setIsResumeDialogOpen={setIsResumeDialogOpen}
        setIsAddPaymentDialogOpen={setIsAddPaymentDialogOpen}
        sendWhatsAppMessage={sendWhatsAppMessage}
        openEditAppointment={openEditAppointment}
        deleteAppointmentMutation={deleteAppointmentMutation}
      />

      {/* Export Columns Selection Dialog */}
      <ExportColumnsDialog
        isExportColumnsDialogOpen={isExportColumnsDialogOpen}
        setIsExportColumnsDialogOpen={setIsExportColumnsDialogOpen}
        appointmentFilters={appointmentFilters}
        specialtyName={specialtyName}
      />

      {/* Table Columns Selection Dialog */}
      <ColumnSelectDialog
        isColumnSelectDialogOpen={isColumnSelectDialogOpen}
        setIsColumnSelectDialogOpen={setIsColumnSelectDialogOpen}
        visibleTableColumns={visibleTableColumns}
        setVisibleTableColumns={setVisibleTableColumns}
      />

      <BulkDeleteDialog
        isBulkDeleteDialogOpen={isBulkDeleteDialogOpen}
        setIsBulkDeleteDialogOpen={setIsBulkDeleteDialogOpen}
        specialtyName={specialtyName}
      />

      {/* Add Payment Dialog */}
      <AddPaymentDialog
        isAddPaymentDialogOpen={isAddPaymentDialogOpen}
        setIsAddPaymentDialogOpen={setIsAddPaymentDialogOpen}
        selectedAppointment={selectedAppointment}
      />


    </div>
  );
}
