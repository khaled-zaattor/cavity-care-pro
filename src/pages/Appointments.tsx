import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, FileText, Filter, X, MessageCircle, CheckSquare, MoreHorizontal, Check, ChevronsUpDown, Pencil, Trash2, ClipboardCheck, Download, Upload, Columns3, CalendarX2, CreditCard } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  appointmentsApi,
  patientsApi,
  doctorsApi,
  catalogApi,
  moneyApi,
  apiErrorMessage,
  dayStartIso,
  dayEndIso,
  type Appointment,
  type AppointmentFilters,
  type AppointmentStatus,
  type Currency,
  type Payment,
  type SubTreatmentStep,
  type TreatmentPlan,
  type TreatmentRecord,
} from "@/api/clinic";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { format } from "date-fns";

interface BulkDeletePreview {
  appointments: Appointment[];
  payments: Payment[];
  treatment_records: TreatmentRecord[];
  totals: { payments_syp: number; payments_usd: number };
}

type ImportRow = { patient_name: string; doctor_name: string; scheduled_at: string; notes?: string | null; status?: AppointmentStatus };

const APPOINTMENT_STATUSES: AppointmentStatus[] = ["Scheduled", "Completed", "Cancelled"];

/** "1,250.5" -> 1250.5, "" -> null */
const toNumberOrNull = (value: string): number | null => {
  const clean = value.replace(/,/g, "").trim();
  if (!clean) return null;
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
};

const sortSteps = (steps?: SubTreatmentStep[]) => [...(steps ?? [])].sort((a, b) => a.step_order - b.step_order);

const emptyAppointmentForm = { patient_id: "", doctor_id: "", specialty_id: "", scheduled_at: "", notes: "" };

export default function Appointments() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isRecordDialogOpen, setIsRecordDialogOpen] = useState(false);
  const [isResumeDialogOpen, setIsResumeDialogOpen] = useState(false);
  const [resumeTreatmentNotes, setResumeTreatmentNotes] = useState("");
  const [isExecutePlanDialogOpen, setIsExecutePlanDialogOpen] = useState(false);
  const [isExecutePlanDetailsDialogOpen, setIsExecutePlanDetailsDialogOpen] = useState(false);
  const [isExportColumnsDialogOpen, setIsExportColumnsDialogOpen] = useState(false);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [bulkDeleteStartDate, setBulkDeleteStartDate] = useState("");
  const [bulkDeleteEndDate, setBulkDeleteEndDate] = useState("");
  const [bulkDeletePreview, setBulkDeletePreview] = useState<BulkDeletePreview | null>(null);
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
  const [isAddPaymentDialogOpen, setIsAddPaymentDialogOpen] = useState(false);
  const [newPaymentAmount, setNewPaymentAmount] = useState("");
  const [newPaymentCurrency, setNewPaymentCurrency] = useState("SYP");
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [selectedSteps, setSelectedSteps] = useState<string[]>([]);
  const [selectedTreatmentRecord, setSelectedTreatmentRecord] = useState<TreatmentRecord | null>(null);
  const [selectedTreatmentPlan, setSelectedTreatmentPlan] = useState<TreatmentPlan | null>(null);
  const [openPatientCombobox, setOpenPatientCombobox] = useState(false);
  const [patientSearchQuery, setPatientSearchQuery] = useState("");
  const [selectedPatientLabel, setSelectedPatientLabel] = useState("");
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [page, setPage] = useState(1);

  const availableColumns = [
    { id: 'patient_name', label: 'اسم المريض' },
    { id: 'phone_number', label: 'رقم الهاتف' },
    { id: 'doctor_name', label: 'الطبيب' },
    { id: 'specialty', label: 'التخصص' },
    { id: 'date', label: 'التاريخ' },
    { id: 'time', label: 'الوقت' },
    { id: 'status', label: 'الحالة' },
    { id: 'notes', label: 'ملاحظات' }
  ];

  const availableTableColumns = [
    { id: 'date_time', label: 'التاريخ والوقت' },
    { id: 'patient_name', label: 'اسم المريض' },
    { id: 'doctor_info', label: 'الطبيب' },
    { id: 'status', label: 'الحالة' },
    { id: 'notes', label: 'ملاحظات' },
    { id: 'actions', label: 'الإجراءات' }
  ];

  const [selectedColumns, setSelectedColumns] = useState<string[]>(
    availableColumns.map(col => col.id)
  );

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

  const [planExecution, setPlanExecution] = useState({
    actual_cost_syp: "",
    actual_cost_usd: "",
    payment_amount: "",
    payment_currency: "SYP",
    notes: "",
    treatment_notes: "",
  });

  const isMobile = useIsMobile();

  // Filter states
  const [filterDoctor, setFilterDoctor] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPatientName, setFilterPatientName] = useState("");
  const [debouncedPatientName, setDebouncedPatientName] = useState("");

  const clearFilters = () => {
    setFilterStartDate("");
    setFilterEndDate("");
    setFilterDoctor("");
    setFilterStatus("");
    setFilterPatientName("");
  };

  const filtersActive = Boolean(
    filterStartDate ||
    filterEndDate ||
    (filterDoctor && filterDoctor !== "all") ||
    (filterStatus && filterStatus !== "all") ||
    filterPatientName
  );

  const [newAppointment, setNewAppointment] = useState(emptyAppointmentForm);

  const [teethType, setTeethType] = useState<"adult" | "child">("adult");
  const [treatmentRecord, setTreatmentRecord] = useState({
    treatment_id: "",
    sub_treatment_id: "",
    tooth_numbers: [] as string[],
    actual_cost_syp: "",
    actual_cost_usd: "",
    payment_amount: "",
    payment_currency: "SYP",
    notes: "",
    treatment_notes: "",
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { canManagePayments, isIndependentDoctor, doctorId: myDoctorId } = useUserRole();

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

  // Load existing notes from appointment when dialog opens
  useEffect(() => {
    if (isRecordDialogOpen && selectedAppointment) {
      setTreatmentRecord(prev => ({
        ...prev,
        notes: selectedAppointment.notes || ""
      }));
    }
  }, [isRecordDialogOpen, selectedAppointment]);

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

  const { data: patients } = useQuery({
    queryKey: ["patients-search", patientSearchQuery],
    queryFn: () => patientsApi.search(patientSearchQuery.trim()),
    enabled: isDialogOpen,
  });

  // Query to get future appointments for selected patient
  const { data: patientFutureAppointments } = useQuery({
    queryKey: ["patient-future-appointments", newAppointment.patient_id],
    queryFn: async () => {
      if (!newAppointment.patient_id) return [];
      const res = await appointmentsApi.list({ patient_id: newAppointment.patient_id, upcoming: true });
      return res.data;
    },
    enabled: !!newAppointment.patient_id,
  });

  const { data: doctors } = useQuery({
    queryKey: ["doctors"],
    queryFn: () => doctorsApi.list(),
  });

  // Specialty shown for an appointment: its own, else the doctor's primary one
  const specialtyName = (apt: Appointment) =>
    apt.specialty?.name_ar || doctors?.find((d) => d.id === apt.doctor_id)?.specialty || "";

  // Doctor chosen in the create/edit dialog (specialty select only when they have several)
  const formDoctor = doctors?.find((d) => d.id === newAppointment.doctor_id);
  const formDoctorHasManySpecialties = (formDoctor?.specialties?.length ?? 0) > 1;

  const { data: allTreatments } = useQuery({
    queryKey: ["treatments", "all-visible"],
    queryFn: () => catalogApi.list(),
  });

  // Only offer the catalog that belongs to the selected appointment's doctor:
  // an independent doctor's own treatments, otherwise the clinic catalog (doctor_id NULL).
  const selectedAppointmentDoctor = doctors?.find((d) => d.id === selectedAppointment?.doctor_id);
  const catalogDoctorId = selectedAppointmentDoctor?.has_own_books ? selectedAppointmentDoctor.id : null;
  const treatments = allTreatments?.filter((t) => (t.doctor_id ?? null) === catalogDoctorId);
  const selectedTreatment = treatments?.find((t) => t.id === treatmentRecord.treatment_id);
  const subTreatments = selectedTreatment?.sub_treatments ?? [];
  const selectedSubTreatment = subTreatments.find((st) => st.id === treatmentRecord.sub_treatment_id);
  const treatmentSteps = sortSteps(selectedSubTreatment?.steps);
  const toothAssociation = selectedSubTreatment?.tooth_association || "not_related";
  const isToothSelectionEnabled = toothAssociation !== "not_related" && selectedTreatment?.specialty?.is_dental !== false;
  const isSingleToothOnly = toothAssociation === "single_tooth";

  // Any sub-treatment of the visible catalog (plans / resumed records)
  const findSubTreatment = (id?: string | null) =>
    id ? allTreatments?.flatMap((t) => t.sub_treatments ?? []).find((st) => st.id === id) : undefined;

  // Query to get completed steps for an appointment
  const { data: completedSteps } = useQuery({
    queryKey: ["completed-steps", selectedAppointment?.id],
    queryFn: () => (selectedAppointment?.id ? appointmentsApi.completedSteps(selectedAppointment.id) : Promise.resolve([] as string[])),
    enabled: !!selectedAppointment?.id,
  });

  // Unfinished treatments for the patient (incomplete + de-duplicated server-side)
  const { data: unfinishedTreatments, error: unfinishedError } = useQuery({
    queryKey: ["unfinished-treatments", selectedAppointment?.patient_id],
    queryFn: () =>
      selectedAppointment?.patient_id
        ? patientsApi.treatmentRecords(selectedAppointment.patient_id, true)
        : Promise.resolve([] as TreatmentRecord[]),
    enabled: !!selectedAppointment?.patient_id,
  });

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
  const planTreatmentSteps = sortSteps(findSubTreatment(selectedTreatmentPlan?.sub_treatment_id)?.steps);

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

  // Steps for the selected treatment record
  const resumeTreatmentSteps = sortSteps(findSubTreatment(selectedTreatmentRecord?.sub_treatment_id)?.steps);

  // Steps already done for the selected treatment (across ALL its sessions)
  const { data: resumeCompletedSteps } = useQuery({
    queryKey: ["resume-completed-steps", selectedAppointment?.id, selectedTreatmentRecord?.id],
    queryFn: () =>
      selectedAppointment?.id && selectedTreatmentRecord?.id
        ? appointmentsApi.completedSteps(selectedAppointment.id, selectedTreatmentRecord.id)
        : Promise.resolve([] as string[]),
    enabled: !!selectedAppointment?.id && !!selectedTreatmentRecord?.id,
  });

  const appointmentPayload = (appointment: typeof newAppointment) => {
    const doctor = doctors?.find((d) => d.id === appointment.doctor_id);
    const many = (doctor?.specialties?.length ?? 0) > 1;
    return {
      patient_id: appointment.patient_id,
      doctor_id: appointment.doctor_id,
      // null lets the server use the doctor's primary specialty
      specialty_id: many ? (appointment.specialty_id || doctor?.primary_specialty_id || null) : null,
      // Convert local datetime to ISO string for proper timezone handling
      scheduled_at: new Date(appointment.scheduled_at).toISOString(),
      notes: appointment.notes || null,
    };
  };

  const resetAppointmentForm = () => {
    setNewAppointment(emptyAppointmentForm);
    setSelectedPatientLabel("");
  };

  const createAppointmentMutation = useMutation({
    mutationFn: (appointment: typeof newAppointment) => appointmentsApi.create(appointmentPayload(appointment)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["patient-future-appointments"] });
      setIsDialogOpen(false);
      resetAppointmentForm();
      toast({ title: "Success", description: "Appointment created successfully" });
    },
    onError: (e) => {
      toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" });
    },
  });

  const updateAppointmentMutation = useMutation({
    mutationFn: (appointment: typeof newAppointment & { id: string }) =>
      appointmentsApi.update(appointment.id, appointmentPayload(appointment)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["patient-future-appointments"] });
      setIsDialogOpen(false);
      setEditingAppointment(null);
      resetAppointmentForm();
      toast({ title: "نجح", description: "تم تحديث الموعد بنجاح" });
    },
    onError: (e) => {
      toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" });
    },
  });

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

  // Mutation to add payment
  const addPaymentMutation = useMutation({
    mutationFn: ({ appointmentId, amount, currency }: { appointmentId: string; amount: number; currency: string }) =>
      moneyApi.addPayment({ appointment_id: appointmentId, amount, currency: currency as Currency }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      setIsAddPaymentDialogOpen(false);
      setNewPaymentAmount("");
      setNewPaymentCurrency("SYP");
      toast({ title: "نجح", description: "تم تسجيل الدفعة بنجاح" });
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

  // F1: one call — the server decides completion, unfinished tracking and payment
  const recordTreatmentMutation = useMutation({
    mutationFn: (record: typeof treatmentRecord) => {
      if (!selectedAppointment) throw new Error("لم يتم اختيار موعد");
      return appointmentsApi.recordTreatment(selectedAppointment.id, {
        treatment_id: record.treatment_id,
        sub_treatment_id: record.sub_treatment_id,
        tooth_numbers: isToothSelectionEnabled ? record.tooth_numbers : [],
        actual_cost_syp: toNumberOrNull(record.actual_cost_syp),
        actual_cost_usd: toNumberOrNull(record.actual_cost_usd),
        payment_amount: toNumberOrNull(record.payment_amount),
        payment_currency: record.payment_currency as Currency,
        notes: record.notes || null,
        treatment_notes: record.treatment_notes || null,
        step_ids: selectedSteps,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["completed-steps"] });
      queryClient.invalidateQueries({ queryKey: ["unfinished-treatments"] });
      setIsRecordDialogOpen(false);
      setTreatmentRecord({ treatment_id: "", sub_treatment_id: "", tooth_numbers: [], actual_cost_syp: "", actual_cost_usd: "", payment_amount: "", payment_currency: "SYP", notes: "", treatment_notes: "" });
      setTeethType("adult");
      setSelectedSteps([]);
      toast({ title: "نجح", description: "تم تسجيل العلاج والدفعة بنجاح" });
    },
    onError: (e) => {
      toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" });
    },
  });

  // F2: resume an unfinished treatment — one call
  const resumeStepsMutation = useMutation({
    mutationFn: (steps: string[]) => {
      if (!selectedAppointment || !selectedTreatmentRecord) throw new Error("No treatment record selected");
      return appointmentsApi.resume(selectedAppointment.id, {
        treatment_record_id: selectedTreatmentRecord.id,
        step_ids: steps,
        notes: resumeTreatmentNotes.trim() || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["completed-steps"] });
      queryClient.invalidateQueries({ queryKey: ["unfinished-treatments"] });
      queryClient.invalidateQueries({ queryKey: ["resume-completed-steps"] });
      setIsResumeDialogOpen(false);
      setSelectedSteps([]);
      setSelectedTreatmentRecord(null);
      setResumeTreatmentNotes("");
      toast({ title: "نجح", description: "تم استكمال خطوات العلاج بنجاح" });
    },
    onError: (e) => {
      toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" });
    },
  });

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

  const updateAppointmentStatus = async (appointmentId: string, status: AppointmentStatus) => {
    try {
      await appointmentsApi.update(appointmentId, { status });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast({ title: "Success", description: "Appointment updated successfully" });
    } catch (e) {
      toast({ title: "Error", description: apiErrorMessage(e), variant: "destructive" });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingAppointment) {
      updateAppointmentMutation.mutate({ ...newAppointment, id: editingAppointment.id });
    } else {
      createAppointmentMutation.mutate(newAppointment);
    }
  };

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

  const handleExportToExcel = async () => {
    // Export every appointment matching the filters, not just the visible page
    let allAppointments: Appointment[] = [];
    try {
      const res = await appointmentsApi.list({ ...appointmentFilters, per_page: 5000 });
      allAppointments = res.data;
    } catch (e) {
      toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" });
      return;
    }

    if (allAppointments.length === 0) {
      toast({
        title: "لا توجد بيانات",
        description: "لا توجد مواعيد لتصديرها",
        variant: "destructive"
      });
      return;
    }

    if (selectedColumns.length === 0) {
      toast({
        title: "لا توجد أعمدة محددة",
        description: "يرجى اختيار عمود واحد على الأقل للتصدير",
        variant: "destructive"
      });
      return;
    }

    // Group appointments by date
    const appointmentsByDate: { [key: string]: Appointment[] } = {};

    allAppointments.forEach(apt => {
      const date = format(new Date(apt.scheduled_at), 'dd/MM/yyyy');
      if (!appointmentsByDate[date]) {
        appointmentsByDate[date] = [];
      }
      appointmentsByDate[date].push(apt);
    });

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Create a sheet for each date
    Object.keys(appointmentsByDate).sort((a, b) => {
      const dateA = new Date(appointmentsByDate[a][0].scheduled_at);
      const dateB = new Date(appointmentsByDate[b][0].scheduled_at);
      return dateB.getTime() - dateA.getTime();
    }).forEach(date => {
      const dayAppointments = appointmentsByDate[date];

      const exportData = dayAppointments.map(apt => {
        const row: Record<string, string> = {};

        if (selectedColumns.includes('patient_name')) {
          row['اسم المريض'] = apt.patient?.full_name || '';
        }
        if (selectedColumns.includes('phone_number')) {
          row['رقم الهاتف'] = apt.patient?.phone_number || '';
        }
        if (selectedColumns.includes('doctor_name')) {
          row['الطبيب'] = apt.doctor?.full_name || '';
        }
        if (selectedColumns.includes('specialty')) {
          row['التخصص'] = specialtyName(apt);
        }
        if (selectedColumns.includes('date')) {
          row['التاريخ'] = format(new Date(apt.scheduled_at), 'dd/MM/yyyy');
        }
        if (selectedColumns.includes('time')) {
          row['الوقت'] = new Date(apt.scheduled_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        }
        if (selectedColumns.includes('status')) {
          row['الحالة'] = apt.status;
        }
        if (selectedColumns.includes('notes')) {
          row['ملاحظات'] = apt.notes || '';
        }

        return row;
      });

      const ws = XLSX.utils.json_to_sheet(exportData);

      // Create a safe sheet name (max 31 chars, no special chars)
      const sheetName = date.substring(0, 31).replace(/[:\\/?*[\]]/g, '-');
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(data, `appointments_${new Date().toISOString().split('T')[0]}.xlsx`);

    toast({
      title: "نجح",
      description: `تم تصدير ${Object.keys(appointmentsByDate).length} يوم من المواعيد إلى Excel بنجاح`
    });

    setIsExportColumnsDialogOpen(false);
  };

  const handleImportFromExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

        if (jsonData.length === 0) {
          toast({
            title: "خطأ",
            description: "الملف فارغ",
            variant: "destructive"
          });
          return;
        }

        // Build the rows; incomplete rows fail here, names are matched by the server
        const rows: ImportRow[] = [];
        const sheetRowNumbers: number[] = [];
        let localFailed = 0;

        jsonData.forEach((row, index) => {
          const patientName = String(row['اسم المريض'] ?? '').trim();
          const doctorName = String(row['الطبيب'] ?? '').trim();
          const dateStr = row['التاريخ'];
          const timeStr = row['الوقت'];
          if (!patientName || !doctorName || !dateStr || !timeStr) {
            localFailed++;
            return;
          }
          const scheduled = new Date(`${dateStr} ${timeStr}`);
          if (isNaN(scheduled.getTime())) {
            localFailed++;
            return;
          }
          const status = String(row['الحالة'] ?? '') as AppointmentStatus;
          rows.push({
            patient_name: patientName,
            doctor_name: doctorName,
            scheduled_at: scheduled.toISOString(),
            notes: row['ملاحظات'] ? String(row['ملاحظات']) : null,
            status: APPOINTMENT_STATUSES.includes(status) ? status : 'Scheduled',
          });
          sheetRowNumbers.push(index + 2); // + header row, 1-based
        });

        let created = 0;
        let failedReasons: string[] = [];
        let serverFailed = 0;
        if (rows.length > 0) {
          const res = await appointmentsApi.import(rows);
          created = res.created;
          serverFailed = res.failed.length;
          failedReasons = res.failed.slice(0, 5).map((f) => `صف ${sheetRowNumbers[f.row - 1] ?? f.row}: ${f.reason}`);
        }

        queryClient.invalidateQueries({ queryKey: ["appointments"] });

        toast({
          title: "اكتمل الاستيراد",
          description: `تم استيراد ${created} موعد بنجاح. فشل: ${serverFailed + localFailed}${failedReasons.length ? `\n${failedReasons.join('\n')}` : ''}`,
        });
      } catch (error) {
        toast({
          title: "خطأ",
          description: apiErrorMessage(error) || "فشل استيراد الملف",
          variant: "destructive"
        });
      }
    };

    reader.readAsArrayBuffer(file);
    e.target.value = ''; // Reset input
  };

  // Validation schema for treatment notes
  const treatmentNotesSchema = z.object({
    notes: z.string().max(2000, { message: "الملاحظات يجب أن لا تتجاوز 2000 حرف" })
  });

  const handleRecordTreatment = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate notes
    try {
      treatmentNotesSchema.parse({ notes: treatmentRecord.notes });
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "خطأ في التحقق",
          description: error.errors[0].message,
          variant: "destructive"
        });
        return;
      }
    }

    recordTreatmentMutation.mutate(treatmentRecord);
  };

  // Helper functions for number formatting
  const formatNumberWithCommas = (value: string) => {
    // Remove existing commas and non-numeric characters except decimal point
    const cleanValue = value.replace(/[^\d.]/g, '');

    // Split by decimal point
    const parts = cleanValue.split('.');

    // Add commas to the integer part
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    // Join back with decimal part if exists
    return parts.join('.');
  };

  const removeCommas = (value: string) => {
    return value.replace(/,/g, '');
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

  // Helper function to convert UTC date to local datetime-local format
  const formatDateForInput = (utcDateString: string) => {
    const date = new Date(utcDateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  return (
    <div className="space-y-6">


      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle><div className="grid gap-2">

            <Input
              id="filter-patient"
              type="text"
              value={filterPatientName}
              onChange={(e) => setFilterPatientName(e.target.value)}
              placeholder="ابحث عن مريض..."
              className="text-xs"
            />
          </div> </CardTitle>
          <div className="flex justify-between items-center">

            <Dialog open={isDialogOpen} onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) {
                setEditingAppointment(null);
                resetAppointmentForm();
                setPatientSearchQuery("");
              }
            }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="ml-2 h-4 w-4" />
                  موعد جديد
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingAppointment ? "تعديل الموعد" : "إنشاء موعد جديد"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="patient_id">المريض</Label>
                    <Popover open={openPatientCombobox} onOpenChange={setOpenPatientCombobox}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={openPatientCombobox}
                          className="w-full justify-between"
                        >
                          {newAppointment.patient_id
                            ? (selectedPatientLabel ||
                              patients?.find((patient) => patient.id === newAppointment.patient_id)?.full_name)
                            : "ابحث عن مريض..."}
                          <ChevronsUpDown className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="z-50 w-full p-0 bg-background" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder="ابحث عن مريض..."
                            className="h-9"
                            value={patientSearchQuery}
                            onValueChange={setPatientSearchQuery}
                          />
                          <CommandList className="max-h-72 overflow-auto">
                            <CommandEmpty>لم يتم العثور على مريض</CommandEmpty>
                            <CommandGroup>
                              {patients?.map((patient) => (
                                <CommandItem
                                  key={patient.id}
                                  value={patient.full_name}
                                  onSelect={() => {
                                    setNewAppointment({ ...newAppointment, patient_id: patient.id });
                                    setSelectedPatientLabel(patient.full_name);
                                    setOpenPatientCombobox(false);
                                    setPatientSearchQuery("");
                                  }}
                                >
                                  {patient.full_name}
                                  <Check
                                    className={cn(
                                      "mr-auto h-4 w-4",
                                      newAppointment.patient_id === patient.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>

                    {/* Display future appointments for selected patient */}
                    {newAppointment.patient_id && patientFutureAppointments && patientFutureAppointments.length > 0 && (
                      <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">
                          مواعيد المريض المستقبلية ({patientFutureAppointments.length}):
                        </p>
                        <ul className="space-y-1 max-h-32 overflow-y-auto">
                          {patientFutureAppointments.map((apt) => (
                            <li key={apt.id} className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
                              <span className="font-medium">
                                {format(new Date(apt.scheduled_at), "yyyy/MM/dd")}
                              </span>
                              <span>
                                {format(new Date(apt.scheduled_at), "HH:mm")}
                              </span>
                              <span className="text-amber-600 dark:text-amber-400">
                                - {apt.doctor?.full_name}
                              </span>
                              <span className={cn(
                                "px-1.5 py-0.5 rounded text-[10px]",
                                apt.status === "Scheduled" && "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
                                apt.status === "Completed" && "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
                                apt.status === "Cancelled" && "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                              )}>
                                {apt.status === "Scheduled" ? "مجدول" : apt.status === "Completed" ? "مكتمل" : "ملغي"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="doctor_id">الطبيب</Label>
                    <Select
                      value={newAppointment.doctor_id}
                      onValueChange={(value) => {
                        const doctor = doctors?.find((d) => d.id === value);
                        setNewAppointment({ ...newAppointment, doctor_id: value, specialty_id: doctor?.primary_specialty_id || "" });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر طبيب" />
                      </SelectTrigger>
                      <SelectContent>
                        {/* Independent doctors can only book appointments for themselves */}
                        {doctors?.filter((doctor) => !isIndependentDoctor || doctor.id === myDoctorId).map((doctor) => (
                          <SelectItem key={doctor.id} value={doctor.id}>
                            {doctor.full_name} - {doctor.specialty}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {formDoctorHasManySpecialties && formDoctor && (
                    <div>
                      <Label htmlFor="specialty_id">التخصص</Label>
                      <Select
                        value={newAppointment.specialty_id || formDoctor.primary_specialty_id || ""}
                        onValueChange={(value) => setNewAppointment({ ...newAppointment, specialty_id: value })}
                      >
                        <SelectTrigger id="specialty_id">
                          <SelectValue placeholder="اختر التخصص" />
                        </SelectTrigger>
                        <SelectContent>
                          {formDoctor.specialties.map((specialty) => (
                            <SelectItem key={specialty.id} value={specialty.id}>
                              {specialty.name_ar}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <Label htmlFor="scheduled_at">التاريخ والوقت</Label>
                    <Input
                      id="scheduled_at"
                      type="datetime-local"
                      value={newAppointment.scheduled_at}
                      onChange={(e) => setNewAppointment({ ...newAppointment, scheduled_at: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="notes">ملاحظات</Label>
                    <Textarea
                      id="notes"
                      value={newAppointment.notes}
                      onChange={(e) => setNewAppointment({ ...newAppointment, notes: e.target.value })}
                    />
                  </div>
                  <Button type="submit" disabled={createAppointmentMutation.isPending || updateAppointmentMutation.isPending}>
                    {editingAppointment
                      ? (updateAppointmentMutation.isPending ? "جاري التحديث..." : "تحديث الموعد")
                      : (createAppointmentMutation.isPending ? "جاري الإنشاء..." : "إنشاء موعد")}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsColumnSelectDialogOpen(true)}
              title="اختيار الأعمدة المرئية"
            >
              <Columns3 className="h-4 w-4 ml-2" />
              الأعمدة
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  title="إعدادات الفلاتر"
                >
                  <Filter className="h-4 w-4 ml-2" />
                  الفلاتر
                  {filtersActive && <span className="mr-1 block h-2 w-2 rounded-full bg-destructive" />}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-4 space-y-4" dir="rtl">
                <div className="grid gap-2">
                  <Label htmlFor="filter-start-date">التاريخ من</Label>
                  <Input
                    id="filter-start-date"
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="filter-end-date">التاريخ إلى</Label>
                  <Input
                    id="filter-end-date"
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="filter-patient">المريض</Label>
                  <Input
                    id="filter-patient"
                    type="text"
                    value={filterPatientName}
                    onChange={(e) => setFilterPatientName(e.target.value)}
                    placeholder="ابحث عن مريض..."
                    className="text-xs"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="filter-doctor">الطبيب</Label>
                  <Select value={filterDoctor} onValueChange={setFilterDoctor}>
                    <SelectTrigger id="filter-doctor" className="text-xs">
                      <SelectValue placeholder="جميع الأطباء" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">جميع الأطباء</SelectItem>
                      {doctors?.map((doctor) => (
                        <SelectItem key={doctor.id} value={doctor.id}>
                          {doctor.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="filter-status">الحالة</Label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger id="filter-status" className="text-xs">
                      <SelectValue placeholder="جميع الحالات" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">جميع الحالات</SelectItem>
                      <SelectItem value="Scheduled">مجدول</SelectItem>
                      <SelectItem value="Completed">مكتمل</SelectItem>
                      <SelectItem value="Cancelled">ملغي</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    disabled={!filtersActive}
                  >
                    <X className="h-3 w-3 ml-1" />
                    مسح جميع الفلاتر
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            <Button
              size="sm"
              onClick={() => setIsExportColumnsDialogOpen(true)}
              title="تصدير إلى Excel"
              className="bg-primary hover:bg-primary/90"
            >
              <Download className="h-4 w-4 ml-2" />
              تصدير
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => document.getElementById('excel-import')?.click()}
              title="استيراد من Excel"
            >
              <Upload className="h-4 w-4 ml-2" />
              استيراد
            </Button>
            <input
              id="excel-import"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImportFromExcel}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsBulkDeleteDialogOpen(true)}
              title="حذف مواعيد بين تاريخين"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <CalendarX2 className="h-4 w-4 ml-2" />
              حذف جماعي
            </Button>
          </div>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      <Dialog open={isRecordDialogOpen} onOpenChange={setIsRecordDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تسجيل علاج</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRecordTreatment} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="treatment_id">العلاج</Label>
                <Select
                  value={treatmentRecord.treatment_id}
                  onValueChange={(value) => setTreatmentRecord({ ...treatmentRecord, treatment_id: value, sub_treatment_id: "" })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر علاج" />
                  </SelectTrigger>
                  <SelectContent>
                    {treatments?.map((treatment) => (
                      <SelectItem key={treatment.id} value={treatment.id}>
                        {treatment.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="sub_treatment_id">العلاج الفرعي</Label>
                <Select
                  value={treatmentRecord.sub_treatment_id}
                  onValueChange={(value) => {
                    const chosenSubTreatment = subTreatments.find(st => st.id === value);
                    setTreatmentRecord({
                      ...treatmentRecord,
                      sub_treatment_id: value,
                      actual_cost_syp: chosenSubTreatment?.estimated_cost_syp?.toString().replace(/,/g, '') || "",
                      actual_cost_usd: chosenSubTreatment?.estimated_cost_usd?.toString().replace(/,/g, '') || "",
                      tooth_numbers: [] // Reset tooth selection when changing sub-treatment
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر علاج فرعي" />
                  </SelectTrigger>
                  <SelectContent>
                    {subTreatments?.map((subTreatment) => (
                      <SelectItem key={subTreatment.id} value={subTreatment.id}>
                        {subTreatment.name} - {formatNumberWithCommas(subTreatment.estimated_cost_syp?.toString() || '0')} ل.س
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {(() => {
              // isToothSelectionEnabled: sub-treatment linked to teeth AND a dental treatment
              return (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2">
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
                          <RadioGroup value={teethType} onValueChange={(value: "adult" | "child") => {
                            setTeethType(value);
                            setTreatmentRecord({ ...treatmentRecord, tooth_numbers: [] });
                          }} className="flex gap-4 justify-center">
                            <div className="flex items-center space-x-2 space-x-reverse">
                              <RadioGroupItem value="adult" id="adult" />
                              <Label htmlFor="adult" className="cursor-pointer">أسنان البالغين</Label>
                            </div>
                            <div className="flex items-center space-x-2 space-x-reverse">
                              <RadioGroupItem value="child" id="child" />
                              <Label htmlFor="child" className="cursor-pointer">أسنان الأطفال</Label>
                            </div>
                          </RadioGroup>
                        </div>

                        {teethType === "adult" ? (
                          <>
                            {/* أسنان البالغين */}
                            <div className="mb-2">
                              <div className="flex gap-0.5 justify-center items-center">
                                {[28, 27, 26, 25, 24, 23, 22, 21].map((toothNum) => (
                                  <button
                                    key={toothNum}
                                    type="button"
                                    onClick={() => {
                                      const toothStr = toothNum.toString();
                                      if (isSingleToothOnly) {
                                        // For single tooth, replace selection
                                        setTreatmentRecord({ ...treatmentRecord, tooth_numbers: [toothStr] });
                                      } else {
                                        // For multiple teeth, toggle selection
                                        const newTeeth = treatmentRecord.tooth_numbers.includes(toothStr)
                                          ? treatmentRecord.tooth_numbers.filter(t => t !== toothStr)
                                          : [...treatmentRecord.tooth_numbers, toothStr];
                                        setTreatmentRecord({ ...treatmentRecord, tooth_numbers: newTeeth });
                                      }
                                    }}
                                    className={`h-[25px] w-[25px] text-xs font-medium border rounded transition-colors ${treatmentRecord.tooth_numbers.includes(toothNum.toString())
                                      ? 'bg-primary text-primary-foreground border-primary'
                                      : 'bg-background hover:bg-muted border-border'
                                      }`}
                                  >
                                    {toothNum}
                                  </button>
                                ))}
                                <div className="w-px h-[25px] bg-border mx-0.5" />
                                {[11, 12, 13, 14, 15, 16, 17, 18].map((toothNum) => (
                                  <button
                                    key={toothNum}
                                    type="button"
                                    onClick={() => {
                                      const toothStr = toothNum.toString();
                                      if (isSingleToothOnly) {
                                        setTreatmentRecord({ ...treatmentRecord, tooth_numbers: [toothStr] });
                                      } else {
                                        const newTeeth = treatmentRecord.tooth_numbers.includes(toothStr)
                                          ? treatmentRecord.tooth_numbers.filter(t => t !== toothStr)
                                          : [...treatmentRecord.tooth_numbers, toothStr];
                                        setTreatmentRecord({ ...treatmentRecord, tooth_numbers: newTeeth });
                                      }
                                    }}
                                    className={`h-[25px] w-[25px] text-xs font-medium border rounded transition-colors ${treatmentRecord.tooth_numbers.includes(toothNum.toString())
                                      ? 'bg-primary text-primary-foreground border-primary'
                                      : 'bg-background hover:bg-muted border-border'
                                      }`}
                                  >
                                    {toothNum}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="h-px bg-border my-2" />

                            <div>
                              <div className="flex gap-0.5 justify-center items-center">
                                {[38, 37, 36, 35, 34, 33, 32, 31].map((toothNum) => (
                                  <button
                                    key={toothNum}
                                    type="button"
                                    onClick={() => {
                                      const toothStr = toothNum.toString();
                                      if (isSingleToothOnly) {
                                        setTreatmentRecord({ ...treatmentRecord, tooth_numbers: [toothStr] });
                                      } else {
                                        const newTeeth = treatmentRecord.tooth_numbers.includes(toothStr)
                                          ? treatmentRecord.tooth_numbers.filter(t => t !== toothStr)
                                          : [...treatmentRecord.tooth_numbers, toothStr];
                                        setTreatmentRecord({ ...treatmentRecord, tooth_numbers: newTeeth });
                                      }
                                    }}
                                    className={`h-[25px] w-[25px] text-xs font-medium border rounded transition-colors ${treatmentRecord.tooth_numbers.includes(toothNum.toString())
                                      ? 'bg-primary text-primary-foreground border-primary'
                                      : 'bg-background hover:bg-muted border-border'
                                      }`}
                                  >
                                    {toothNum}
                                  </button>
                                ))}
                                <div className="w-px h-[25px] bg-border mx-0.5" />
                                {[41, 42, 43, 44, 45, 46, 47, 48].map((toothNum) => (
                                  <button
                                    key={toothNum}
                                    type="button"
                                    onClick={() => {
                                      const toothStr = toothNum.toString();
                                      if (isSingleToothOnly) {
                                        setTreatmentRecord({ ...treatmentRecord, tooth_numbers: [toothStr] });
                                      } else {
                                        const newTeeth = treatmentRecord.tooth_numbers.includes(toothStr)
                                          ? treatmentRecord.tooth_numbers.filter(t => t !== toothStr)
                                          : [...treatmentRecord.tooth_numbers, toothStr];
                                        setTreatmentRecord({ ...treatmentRecord, tooth_numbers: newTeeth });
                                      }
                                    }}
                                    className={`h-[25px] w-[25px] text-xs font-medium border rounded transition-colors ${treatmentRecord.tooth_numbers.includes(toothNum.toString())
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
                            <div className="mb-2">
                              <div className="flex gap-0.5 justify-center items-center">
                                {[65, 64, 63, 62, 61].map((toothNum) => (
                                  <button
                                    key={toothNum}
                                    type="button"
                                    onClick={() => {
                                      const toothStr = toothNum.toString();
                                      if (isSingleToothOnly) {
                                        setTreatmentRecord({ ...treatmentRecord, tooth_numbers: [toothStr] });
                                      } else {
                                        const newTeeth = treatmentRecord.tooth_numbers.includes(toothStr)
                                          ? treatmentRecord.tooth_numbers.filter(t => t !== toothStr)
                                          : [...treatmentRecord.tooth_numbers, toothStr];
                                        setTreatmentRecord({ ...treatmentRecord, tooth_numbers: newTeeth });
                                      }
                                    }}
                                    className={`h-[25px] w-[25px] text-xs font-medium border rounded transition-colors ${treatmentRecord.tooth_numbers.includes(toothNum.toString())
                                      ? 'bg-primary text-primary-foreground border-primary'
                                      : 'bg-background hover:bg-muted border-border'
                                      }`}
                                  >
                                    {toothNum}
                                  </button>
                                ))}
                                <div className="w-px h-[25px] bg-border mx-0.5" />
                                {[51, 52, 53, 54, 55].map((toothNum) => (
                                  <button
                                    key={toothNum}
                                    type="button"
                                    onClick={() => {
                                      const toothStr = toothNum.toString();
                                      if (isSingleToothOnly) {
                                        setTreatmentRecord({ ...treatmentRecord, tooth_numbers: [toothStr] });
                                      } else {
                                        const newTeeth = treatmentRecord.tooth_numbers.includes(toothStr)
                                          ? treatmentRecord.tooth_numbers.filter(t => t !== toothStr)
                                          : [...treatmentRecord.tooth_numbers, toothStr];
                                        setTreatmentRecord({ ...treatmentRecord, tooth_numbers: newTeeth });
                                      }
                                    }}
                                    className={`h-[25px] w-[25px] text-xs font-medium border rounded transition-colors ${treatmentRecord.tooth_numbers.includes(toothNum.toString())
                                      ? 'bg-primary text-primary-foreground border-primary'
                                      : 'bg-background hover:bg-muted border-border'
                                      }`}
                                  >
                                    {toothNum}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="h-px bg-border my-2" />

                            <div>
                              <div className="flex gap-0.5 justify-center items-center">
                                {[75, 74, 73, 72, 71].map((toothNum) => (
                                  <button
                                    key={toothNum}
                                    type="button"
                                    onClick={() => {
                                      const toothStr = toothNum.toString();
                                      if (isSingleToothOnly) {
                                        setTreatmentRecord({ ...treatmentRecord, tooth_numbers: [toothStr] });
                                      } else {
                                        const newTeeth = treatmentRecord.tooth_numbers.includes(toothStr)
                                          ? treatmentRecord.tooth_numbers.filter(t => t !== toothStr)
                                          : [...treatmentRecord.tooth_numbers, toothStr];
                                        setTreatmentRecord({ ...treatmentRecord, tooth_numbers: newTeeth });
                                      }
                                    }}
                                    className={`h-[25px] w-[25px] text-xs font-medium border rounded transition-colors ${treatmentRecord.tooth_numbers.includes(toothNum.toString())
                                      ? 'bg-primary text-primary-foreground border-primary'
                                      : 'bg-background hover:bg-muted border-border'
                                      }`}
                                  >
                                    {toothNum}
                                  </button>
                                ))}
                                <div className="w-px h-[25px] bg-border mx-0.5" />
                                {[81, 82, 83, 84, 85].map((toothNum) => (
                                  <button
                                    key={toothNum}
                                    type="button"
                                    onClick={() => {
                                      const toothStr = toothNum.toString();
                                      if (isSingleToothOnly) {
                                        setTreatmentRecord({ ...treatmentRecord, tooth_numbers: [toothStr] });
                                      } else {
                                        const newTeeth = treatmentRecord.tooth_numbers.includes(toothStr)
                                          ? treatmentRecord.tooth_numbers.filter(t => t !== toothStr)
                                          : [...treatmentRecord.tooth_numbers, toothStr];
                                        setTreatmentRecord({ ...treatmentRecord, tooth_numbers: newTeeth });
                                      }
                                    }}
                                    className={`h-[25px] w-[25px] text-xs font-medium border rounded transition-colors ${treatmentRecord.tooth_numbers.includes(toothNum.toString())
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

                        {treatmentRecord.tooth_numbers.length > 0 && (
                          <div className="mt-2 text-center text-xs text-primary">
                            الأسنان المحددة: {treatmentRecord.tooth_numbers.sort((a, b) => parseInt(a) - parseInt(b)).join(", ")}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor="actual_cost_syp">التكلفة بالليرة السورية</Label>
                        <Input
                          id="actual_cost_syp"
                          type="text"
                          value={treatmentRecord.actual_cost_syp ? formatNumberWithCommas(treatmentRecord.actual_cost_syp) : ''}
                          onChange={(e) => {
                            const rawValue = removeCommas(e.target.value);
                            setTreatmentRecord({ ...treatmentRecord, actual_cost_syp: rawValue });
                          }}
                          placeholder="التكلفة بالليرة"
                        />
                      </div>
                      <div>
                        <Label htmlFor="actual_cost_usd">التكلفة بالدولار</Label>
                        <Input
                          id="actual_cost_usd"
                          type="text"
                          value={treatmentRecord.actual_cost_usd ? formatNumberWithCommas(treatmentRecord.actual_cost_usd) : ''}
                          onChange={(e) => {
                            const rawValue = removeCommas(e.target.value);
                            setTreatmentRecord({ ...treatmentRecord, actual_cost_usd: rawValue });
                          }}
                          placeholder="التكلفة بالدولار"
                        />
                      </div>
                    </div>
                    {canManagePayments && (
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <Label htmlFor="payment_amount">مبلغ الدفعة (اختياري)</Label>
                          <Input
                            id="payment_amount"
                            type="text"
                            value={treatmentRecord.payment_amount ? formatNumberWithCommas(treatmentRecord.payment_amount) : ''}
                            onChange={(e) => {
                              const rawValue = removeCommas(e.target.value);
                              setTreatmentRecord({ ...treatmentRecord, payment_amount: rawValue });
                            }}
                            placeholder="أدخل مبلغ الدفعة"
                          />
                        </div>
                        <div>
                          <Label htmlFor="payment_currency">العملة</Label>
                          <Select value={treatmentRecord.payment_currency} onValueChange={(value) => setTreatmentRecord({ ...treatmentRecord, payment_currency: value })}>
                            <SelectTrigger>
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
                    {canManagePayments && (
                      <p className="text-xs text-muted-foreground mt-1">
                        اترك فارغاً إذا لم يتم الدفع
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Notes Section - Split into two columns */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="appointment_notes">ملاحظة الموعد</Label>
                <Textarea
                  id="appointment_notes"
                  value={treatmentRecord.notes}
                  onChange={(e) => setTreatmentRecord({ ...treatmentRecord, notes: e.target.value })}
                  placeholder="أضف ملاحظات حول الموعد..."
                  rows={3}
                  className="resize-none"
                />
                {selectedAppointment?.notes && (
                  <p className="text-xs text-muted-foreground mt-1">
                    الملاحظة السابقة: {selectedAppointment.notes}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="treatment_notes_field">ملاحظة العلاج</Label>
                <Textarea
                  id="treatment_notes_field"
                  value={treatmentRecord.treatment_notes}
                  onChange={(e) => setTreatmentRecord({ ...treatmentRecord, treatment_notes: e.target.value })}
                  placeholder="أضف ملاحظات حول العلاج..."
                  rows={3}
                  className="resize-none"
                />
              </div>
            </div>

            {/* Treatment Steps Section */}
            {treatmentRecord.sub_treatment_id && treatmentSteps && treatmentSteps.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">خطوات العلاج المنجزة في هذا الموعد</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 max-h-48 overflow-y-auto border rounded-lg p-2 bg-muted/30">
                  {treatmentSteps.map((step) => {
                    const isCompleted = completedSteps?.includes(step.id);
                    const isSelected = selectedSteps.includes(step.id);

                    return (
                      <div
                        key={step.id}
                        className={`flex items-start space-x-2 p-2 border rounded transition-colors ${isCompleted ? 'bg-green-50 border-green-200' :
                          isSelected ? 'bg-blue-50 border-blue-200' : 'bg-card'
                          }`}
                      >
                        <Checkbox
                          id={step.id}
                          checked={isSelected}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedSteps([...selectedSteps, step.id]);
                            } else {
                              setSelectedSteps(selectedSteps.filter(id => id !== step.id));
                            }
                          }}
                          disabled={isCompleted}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <Label
                            htmlFor={step.id}
                            className={`cursor-pointer text-xs font-medium block ${isCompleted ? 'text-green-700' : ''}`}
                          >
                            {step.step_order}. {step.step_name}
                            {isCompleted && <span className="text-green-600 mr-1 text-xs">✓</span>}
                          </Label>
                          {step.step_description && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {step.step_description}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  ({selectedSteps.length} من {treatmentSteps.length} خطوات محددة)
                </p>
              </div>
            )}

            <Button type="submit" disabled={recordTreatmentMutation.isPending}>
              {recordTreatmentMutation.isPending ? "جاري التسجيل..." : "تسجيل العلاج والخطوات"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isResumeDialogOpen} onOpenChange={setIsResumeDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>استكمال علاج - {selectedAppointment?.patient?.full_name}</DialogTitle>
          </DialogHeader>

          {/* Debug info - remove in production */}
          {unfinishedTreatments && unfinishedTreatments.length > 0 ? (
            <div className="space-y-4">
              <div>
                <Label className="text-base font-semibold">اختر العلاج المراد استكماله</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                  {unfinishedTreatments.map((treatment) => (
                    <Card
                      key={treatment.id}
                      className={`cursor-pointer transition-colors ${selectedTreatmentRecord?.id === treatment.id
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                        }`}
                      onClick={() => {
                        setSelectedTreatmentRecord(treatment);
                        setSelectedSteps([]);
                      }}
                    >
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-semibold">{treatment.treatment?.name}</h4>
                            <p className="text-sm text-muted-foreground">{treatment.sub_treatment?.name}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              السن: {treatment.tooth_number} | التكلفة: {Math.round(treatment.actual_cost_syp || 0).toLocaleString('en-US')} ل.س - {Math.round(treatment.actual_cost_usd || 0).toLocaleString('en-US')} $
                            </p>
                          </div>
                          <div className="text-xs text-orange-600 font-medium">
                            غير مكتمل
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {selectedTreatmentRecord && resumeTreatmentSteps && resumeTreatmentSteps.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-base font-semibold">خطوات العلاج المتبقية</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-60 overflow-y-auto border rounded-lg p-3 bg-muted/30">
                    {resumeTreatmentSteps.map((step) => {
                      const isCompleted = resumeCompletedSteps?.includes(step.id);
                      const isSelected = selectedSteps.includes(step.id);

                      return (
                        <div
                          key={step.id}
                          className={`flex items-start space-x-2 p-3 border rounded-lg transition-colors ${isCompleted ? 'bg-green-50 border-green-200' :
                            isSelected ? 'bg-blue-50 border-blue-200' : 'bg-card'
                            }`}
                        >
                          <Checkbox
                            id={`resume-${step.id}`}
                            checked={isSelected}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedSteps([...selectedSteps, step.id]);
                              } else {
                                setSelectedSteps(selectedSteps.filter(id => id !== step.id));
                              }
                            }}
                            disabled={isCompleted}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <Label
                              htmlFor={`resume-${step.id}`}
                              className={`cursor-pointer text-sm font-medium block ${isCompleted ? 'text-green-700' : ''}`}
                            >
                              {step.step_order}. {step.step_name}
                              {isCompleted && <span className="text-green-600 mr-2 text-xs block">✓ مكتملة سابقاً</span>}
                            </Label>
                            {step.step_description && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {step.step_description}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    اختر الخطوات التي تم إنجازها في هذا الموعد ({selectedSteps.length} خطوات جديدة)
                  </p>
                </div>
              )}

              {selectedTreatmentRecord && (
                <>
                  <div>
                    <Label htmlFor="resume_treatment_notes">ملاحظات العلاج</Label>
                    <Textarea
                      id="resume_treatment_notes"
                      value={resumeTreatmentNotes}
                      onChange={(e) => setResumeTreatmentNotes(e.target.value)}
                      placeholder="أضف ملاحظات حول العلاج..."
                      rows={3}
                      className="resize-none"
                    />
                    {selectedTreatmentRecord.treatment_notes && (
                      <p className="text-xs text-muted-foreground mt-1">
                        الملاحظات السابقة: {selectedTreatmentRecord.treatment_notes}
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={() => resumeStepsMutation.mutate(selectedSteps)}
                    disabled={resumeStepsMutation.isPending || selectedSteps.length === 0}
                    className="w-full"
                  >
                    {resumeStepsMutation.isPending ? "جاري الحفظ..." : `حفظ ${selectedSteps.length} خطوات مكتملة`}
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <CheckSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <p>لا توجد علاجات غير مكتملة لهذا المريض</p>
              {unfinishedError && (
                <p className="text-red-500 text-sm mt-2">خطأ: {unfinishedError.message}</p>
              )}
              <p className="text-xs mt-2">معرف المريض: {selectedAppointment?.patient_id}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

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

      {/* Options Menu Dialog */}
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

      {/* Export Columns Selection Dialog */}
      <Dialog open={isExportColumnsDialogOpen} onOpenChange={setIsExportColumnsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>اختر الأعمدة للتصدير</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-3">
              {availableColumns.map((column) => (
                <div key={column.id} className="flex items-center space-x-2 space-x-reverse">
                  <Checkbox
                    id={column.id}
                    checked={selectedColumns.includes(column.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedColumns([...selectedColumns, column.id]);
                      } else {
                        setSelectedColumns(selectedColumns.filter(id => id !== column.id));
                      }
                    }}
                  />
                  <Label
                    htmlFor={column.id}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    {column.label}
                  </Label>
                </div>
              ))}
            </div>

            <div className="flex justify-between gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  if (selectedColumns.length === availableColumns.length) {
                    setSelectedColumns([]);
                  } else {
                    setSelectedColumns(availableColumns.map(col => col.id));
                  }
                }}
              >
                {selectedColumns.length === availableColumns.length ? 'إلغاء الكل' : 'تحديد الكل'}
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsExportColumnsDialogOpen(false)}
                >
                  إلغاء
                </Button>
                <Button
                  onClick={handleExportToExcel}
                  disabled={selectedColumns.length === 0}
                >
                  <Download className="h-4 w-4 ml-2" />
                  تصدير
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Table Columns Selection Dialog */}
      <Dialog open={isColumnSelectDialogOpen} onOpenChange={setIsColumnSelectDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>اختر الأعمدة المرئية</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-3">
              {availableTableColumns.map((column) => (
                <div key={column.id} className="flex items-center space-x-2 space-x-reverse">
                  <Checkbox
                    id={`table-${column.id}`}
                    checked={visibleTableColumns.includes(column.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setVisibleTableColumns([...visibleTableColumns, column.id]);
                      } else {
                        setVisibleTableColumns(visibleTableColumns.filter(id => id !== column.id));
                      }
                    }}
                  />
                  <Label
                    htmlFor={`table-${column.id}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    {column.label}
                  </Label>
                </div>
              ))}
            </div>

            <div className="flex justify-between gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  if (visibleTableColumns.length === availableTableColumns.length) {
                    setVisibleTableColumns([]);
                  } else {
                    setVisibleTableColumns(availableTableColumns.map(col => col.id));
                  }
                }}
              >
                {visibleTableColumns.length === availableTableColumns.length ? 'إلغاء الكل' : 'تحديد الكل'}
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsColumnSelectDialogOpen(false)}
                >
                  إلغاء
                </Button>
                <Button
                  onClick={() => setIsColumnSelectDialogOpen(false)}
                >
                  حفظ
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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

      {/* Add Payment Dialog */}
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

    </div>
  );
}