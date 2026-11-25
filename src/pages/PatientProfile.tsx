import { useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import * as XLSX from 'xlsx';
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { PatientActivityHistory } from "@/components/PatientActivityHistory";
import { PatientPrescriptions } from "@/components/PatientPrescriptions";
import { PatientFiles } from "@/components/PatientFiles";
import { PatientTimeline } from "@/components/PatientTimeline";
import { PrescriptionDialog } from "@/components/PrescriptionDialog";
import { GynecologyProfileCard } from "@/components/GynecologyProfileCard";
import { PatientMedicalRecord } from "@/components/PatientMedicalRecord";
import {
  apiErrorMessage,
  appointmentsApi,
  catalogApi,
  doctorsApi,
  patientsApi,
} from "@/api/clinic";
import { fmtDate } from "./patient-profile/utils";
import { PatientHeader } from "./patient-profile/PatientHeader";
import { PatientInfoCards } from "./patient-profile/PatientInfoCards";
import { AppointmentsHistorySection } from "./patient-profile/AppointmentsHistorySection";
import { PaymentDialogs } from "./patient-profile/PaymentDialogs";
import { TreatmentsSection } from "./patient-profile/TreatmentsSection";
import { PaymentsSection } from "./patient-profile/PaymentsSection";

export default function PatientProfile() {
  const { patientId = "" } = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canManagePayments, isSuperAdmin, userRole, isDentalOnlyDoctor } = useUserRole();
  // الملف النسائي and echo images: everyone except doctors who only practise dentistry
  const showGynecology = !isDentalOnlyDoctor;
  const canPrescribe = userRole === "super_admin" || userRole === "doctor";
  const [isPrescriptionOpen, setIsPrescriptionOpen] = useState(false);

  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isEditPaymentDialogOpen, setIsEditPaymentDialogOpen] = useState(false);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState("");
  const [activeSection, setActiveSection] = useState("all"); // "all", "appointments", "treatments", "payments", "prescriptions", "files", "timeline", "history" (admin)
  const [editingPayments, setEditingPayments] = useState<{[key: string]: string}>({});

  const showError = (e: unknown) =>
    toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" });

  // Fetch patient data
  const { data: patient } = useQuery({
    queryKey: ["patient", patientId],
    queryFn: () => patientsApi.get(patientId),
    enabled: !!patientId,
  });

  // Query to get future appointments for this patient
  const { data: patientFutureAppointments } = useQuery({
    queryKey: ["patient-future-appointments", patientId],
    queryFn: () => appointmentsApi.list({ patient_id: patientId, upcoming: true }).then((r) => r.data),
    enabled: !!patientId,
  });

  // Fetch doctors
  const { data: doctors } = useQuery({
    queryKey: ["doctors"],
    queryFn: () => doctorsApi.list(),
  });

  // Fetch treatments (with nested sub-treatments)
  const { data: treatments } = useQuery({
    queryKey: ["treatments", "all-visible"],
    queryFn: () => catalogApi.list(),
  });

  const invalidatePatientMoney = () => {
    queryClient.invalidateQueries({ queryKey: ["patient-balance", patientId] });
    queryClient.invalidateQueries({ queryKey: ["all-payments", patientId] });
    queryClient.invalidateQueries({ queryKey: ["all-treatment-records", patientId] });
    queryClient.invalidateQueries({ queryKey: ["patient-appointments", patientId] });
  };

  // Fetch unfinished sub-treatments
  const { data: unfinishedSubTreatments } = useQuery({
    queryKey: ["unfinished-sub-treatments", patientId],
    queryFn: () => patientsApi.unfinished(patientId),
    enabled: !!patientId,
  });

  // Fetch appointments
  const { data: appointments } = useQuery({
    queryKey: ["patient-appointments", patientId],
    queryFn: () => patientsApi.appointments(patientId),
    enabled: !!patientId,
  });

  // Patient balance (computed on the server, per books and per specialty)
  const { data: balance } = useQuery({
    queryKey: ["patient-balance", patientId],
    queryFn: () => patientsApi.balance(patientId),
    enabled: !!patientId,
  });

  // Fetch all treatment records for this patient (executed steps embedded)
  const { data: allTreatmentRecords } = useQuery({
    queryKey: ["all-treatment-records", patientId],
    queryFn: () => patientsApi.treatmentRecords(patientId),
    enabled: !!patientId,
  });

  // Fetch all payments for this patient
  const { data: allPayments } = useQuery({
    queryKey: ["all-payments", patientId],
    queryFn: () => patientsApi.payments(patientId),
    enabled: !!patientId,
  });

  const handleExportPatientData = () => {
    if (!patient) return;
    // Prepare appointments data
    const appointmentsData = appointments?.map(apt => ({
      'التاريخ': fmtDate(apt.scheduled_at),
      'الوقت': new Date(apt.scheduled_at).toLocaleTimeString('ar-EG'),
      'الطبيب': apt.doctor?.full_name || '',
      'الحالة': apt.status === 'Completed' ? 'مكتمل' : apt.status === 'Scheduled' ? 'مجدول' : 'ملغي',
      'الملاحظات': apt.notes || '-'
    })) || [];

    // Prepare treatments data
    const treatmentsData = allTreatmentRecords?.map(record => ({
      'التاريخ': fmtDate(record.appointment?.scheduled_at),
      'الطبيب': record.appointment?.doctor?.full_name || '',
      'العلاج': record.treatment?.name || '',
      'الإجراء الفرعي': record.sub_treatment?.name || '',
      'السن': record.tooth_number,
      'التكلفة بالليرة': Math.round(record.actual_cost_syp || 0),
      'التكلفة بالدولار': record.actual_cost_usd || 0,
      'الحالة': record.is_completed ? 'مكتمل' : 'غير مكتمل'
    })) || [];

    // Prepare payments data
    const paymentsData = allPayments?.map(payment => ({
      'التاريخ': fmtDate(payment.paid_at),
      'المبلغ': Math.round(payment.amount),
      'العملة': payment.currency === 'USD' ? 'دولار' : 'ليرة سورية',
      'الموعد': fmtDate(payment.appointment?.scheduled_at),
      'الطبيب': payment.appointment?.doctor?.full_name || ''
    })) || [];

    // Totals come from the server balance
    const summaryData = [{
      'إجمالي التكلفة بالليرة': Math.round(balance?.total_cost_syp ?? 0),
      'إجمالي التكلفة بالدولار': balance?.total_cost_usd ?? 0,
      'إجمالي المدفوع بالليرة': Math.round(balance?.total_paid_syp ?? 0),
      'إجمالي المدفوع بالدولار': balance?.total_paid_usd ?? 0,
      'الرصيد بالليرة': Math.round(balance?.syp ?? 0),
      'الرصيد بالدولار': balance?.usd ?? 0,
    }];

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Add patient info sheet
    const patientInfo = [{
      'الاسم': patient.full_name,
      'تاريخ الميلاد': fmtDate(patient.date_of_birth),
      'الهاتف': patient.phone_number,
      'جهة الاتصال': patient.contact || '-',
      'الملاحظات الطبية': patient.medical_notes || '-'
    }];
    const wsPatient = XLSX.utils.json_to_sheet(patientInfo);
    XLSX.utils.book_append_sheet(wb, wsPatient, 'معلومات المريض');

    // Add summary sheet
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'الملخص المالي');

    // Add appointments sheet
    const wsAppointments = XLSX.utils.json_to_sheet(appointmentsData);
    XLSX.utils.book_append_sheet(wb, wsAppointments, 'المواعيد');

    // Add treatments sheet
    const wsTreatments = XLSX.utils.json_to_sheet(treatmentsData);
    XLSX.utils.book_append_sheet(wb, wsTreatments, 'العلاجات');

    // Add payments sheet
    const wsPayments = XLSX.utils.json_to_sheet(paymentsData);
    XLSX.utils.book_append_sheet(wb, wsPayments, 'المدفوعات');

    // Generate file
    XLSX.writeFile(wb, `${patient.full_name} - ملف المريض.xlsx`);

    toast({
      title: "تم التصدير بنجاح",
      description: "تم تصدير بيانات المريض إلى ملف Excel"
    });
  };

  if (!patient) return <div>جاري تحميل بيانات المريض...</div>;

  return (
    <div className="space-y-6">
      <PatientHeader
        patient={patient}
        patientId={patientId}
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        handleExportPatientData={handleExportPatientData}
      />

      {/* Patient Info Cards - Always visible */}
      <PatientInfoCards
        patient={patient}
        patientId={patientId}
        balance={balance}
        doctors={doctors}
        treatments={treatments}
        patientFutureAppointments={patientFutureAppointments}
        canPrescribe={canPrescribe}
        setIsPrescriptionOpen={setIsPrescriptionOpen}
        showError={showError}
      />

      {(activeSection === "all" || activeSection === "timeline") && patientId && (
        <>
          {showGynecology && <GynecologyProfileCard patientId={patientId} />}
          <PatientMedicalRecord patientId={patientId} showEcho={showGynecology} />
        </>
      )}

      {/* Unfinished Treatments - Always visible when exists */}
      {unfinishedSubTreatments && unfinishedSubTreatments.length > 0 && (
        <Card className="border-red-500">
          <CardHeader>
            <CardTitle className="text-red-600">إجراءات غير مكتملة</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">العلاج</TableHead>
                  <TableHead className="text-right">الإجراء الفرعي</TableHead>
                  <TableHead className="text-right">السن</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unfinishedSubTreatments.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.treatment_name}</TableCell>
                    <TableCell>{item.sub_treatment_name}</TableCell>
                    <TableCell>{item.tooth_number}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Appointments History Section */}
      {(activeSection === "all" || activeSection === "appointments") && (
        <AppointmentsHistorySection
          appointments={appointments}
          setSelectedAppointmentId={setSelectedAppointmentId}
          setIsPaymentDialogOpen={setIsPaymentDialogOpen}
          setEditingPayments={setEditingPayments}
          setIsEditPaymentDialogOpen={setIsEditPaymentDialogOpen}
        />
      )}

      <PaymentDialogs
        selectedAppointmentId={selectedAppointmentId}
        isPaymentDialogOpen={isPaymentDialogOpen}
        setIsPaymentDialogOpen={setIsPaymentDialogOpen}
        isEditPaymentDialogOpen={isEditPaymentDialogOpen}
        setIsEditPaymentDialogOpen={setIsEditPaymentDialogOpen}
        editingPayments={editingPayments}
        setEditingPayments={setEditingPayments}
        invalidatePatientMoney={invalidatePatientMoney}
        showError={showError}
      />

      <TreatmentsSection
        activeSection={activeSection}
        patientId={patientId}
        allTreatmentRecords={allTreatmentRecords}
        invalidatePatientMoney={invalidatePatientMoney}
        showError={showError}
      />

      {/* All Payments Section */}
      {(activeSection === "all" || activeSection === "payments") && (
        <PaymentsSection allPayments={allPayments} balance={balance} />
      )}

      {(activeSection === "all" || activeSection === "prescriptions") && patient && (
        <PatientPrescriptions patient={{ id: patient.id, full_name: patient.full_name }} />
      )}

      {(activeSection === "all" || activeSection === "files") && patientId && <PatientFiles patientId={patientId} />}

      {activeSection === "timeline" && patientId && <PatientTimeline patientId={patientId} />}

      {isSuperAdmin && activeSection === "history" && patientId && <PatientActivityHistory patientId={patientId} />}

      {patient && (
        <PrescriptionDialog
          open={isPrescriptionOpen}
          onOpenChange={setIsPrescriptionOpen}
          patient={{ id: patient.id, full_name: patient.full_name }}
        />
      )}
    </div>
  );
}
