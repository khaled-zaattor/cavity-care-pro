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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { format } from "date-fns";

export default function Appointments() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isRecordDialogOpen, setIsRecordDialogOpen] = useState(false);
  const [isStepsDialogOpen, setIsStepsDialogOpen] = useState(false);
  const [isResumeDialogOpen, setIsResumeDialogOpen] = useState(false);
  const [resumeTreatmentNotes, setResumeTreatmentNotes] = useState("");
  const [isExecutePlanDialogOpen, setIsExecutePlanDialogOpen] = useState(false);
  const [isExecutePlanDetailsDialogOpen, setIsExecutePlanDetailsDialogOpen] = useState(false);
  const [isExportColumnsDialogOpen, setIsExportColumnsDialogOpen] = useState(false);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [bulkDeleteStartDate, setBulkDeleteStartDate] = useState("");
  const [bulkDeleteEndDate, setBulkDeleteEndDate] = useState("");
  const [bulkDeletePreview, setBulkDeletePreview] = useState<any>(null);
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
  const [isAddPaymentDialogOpen, setIsAddPaymentDialogOpen] = useState(false);
  const [newPaymentAmount, setNewPaymentAmount] = useState("");
  const [newPaymentCurrency, setNewPaymentCurrency] = useState("SYP");
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [selectedSteps, setSelectedSteps] = useState<string[]>([]);
  const [selectedTreatmentRecord, setSelectedTreatmentRecord] = useState<any>(null);
  const [selectedTreatmentPlan, setSelectedTreatmentPlan] = useState<any>(null);
  const [openPatientCombobox, setOpenPatientCombobox] = useState(false);
  const [patientSearchQuery, setPatientSearchQuery] = useState("");
  const [editingAppointment, setEditingAppointment] = useState<any>(null);

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

  const [newAppointment, setNewAppointment] = useState({
    patient_id: "",
    doctor_id: "",
    scheduled_at: "",
    notes: "",
  });

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
  const { canManagePayments } = useUserRole();

  // Debounce patient name filter
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPatientName(filterPatientName);
    }, 500);

    return () => clearTimeout(timer);
  }, [filterPatientName]);

  // Load existing notes from appointment when dialog opens
  useEffect(() => {
    if (isRecordDialogOpen && selectedAppointment) {
      setTreatmentRecord(prev => ({
        ...prev,
        notes: selectedAppointment.notes || ""
      }));
    }
  }, [isRecordDialogOpen, selectedAppointment]);

  const { data: appointments, isLoading } = useQuery({
    queryKey: ["appointments", filterDoctor, filterStartDate, filterEndDate, filterStatus, debouncedPatientName],
    queryFn: async () => {
      let query = supabase
        .from("appointments")
        .select(`
          *,
          patients (full_name, phone_number),
          doctors (full_name, specialty)
        `);

      // Apply doctor filter
      if (filterDoctor && filterDoctor !== "all") {
        query = query.eq("doctor_id", filterDoctor);
      }

      // Apply date range filter
      if (filterStartDate && filterEndDate) {
        const startOfDay = new Date(filterStartDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(filterEndDate);
        endOfDay.setHours(23, 59, 59, 999);

        query = query
          .gte("scheduled_at", startOfDay.toISOString())
          .lte("scheduled_at", endOfDay.toISOString());
      } else if (filterStartDate) {
        // If only start date is selected, filter from that date onwards
        const startOfDay = new Date(filterStartDate);
        startOfDay.setHours(0, 0, 0, 0);
        query = query.gte("scheduled_at", startOfDay.toISOString());
      } else if (filterEndDate) {
        // If only end date is selected, filter up to that date
        const endOfDay = new Date(filterEndDate);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte("scheduled_at", endOfDay.toISOString());
      }

      // Apply status filter
      if (filterStatus && filterStatus !== "all") {
        query = query.eq("status", filterStatus as "Scheduled" | "Completed" | "Cancelled");
      }

      const { data, error } = await query.order("scheduled_at", { ascending: false });
      if (error) throw error;

      // Apply patient name filter (client-side since we're filtering on joined data)
      if (debouncedPatientName && data) {
        return data.filter(apt =>
          apt.patients?.full_name?.toLowerCase().includes(debouncedPatientName.toLowerCase())
        );
      }

      return data;
    },
  });

  const { data: patients } = useQuery({
    queryKey: ["patients", patientSearchQuery],
    queryFn: async () => {
      let query = supabase.from("patients").select("id, full_name");

      if (patientSearchQuery) {
        query = query.ilike("full_name", `%${patientSearchQuery}%`);
      }

      const { data, error } = await query.order("full_name");
      if (error) throw error;
      return data;
    },
  });

  // Query to get future appointments for selected patient
  const { data: patientFutureAppointments } = useQuery({
    queryKey: ["patient-future-appointments", newAppointment.patient_id],
    queryFn: async () => {
      if (!newAppointment.patient_id) return [];
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("appointments")
        .select(`
          id,
          scheduled_at,
          status,
          doctors (full_name)
        `)
        .eq("patient_id", newAppointment.patient_id)
        .gte("scheduled_at", now)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!newAppointment.patient_id,
  });

  const { data: doctors } = useQuery({
    queryKey: ["doctors"],
    queryFn: async () => {
      const { data, error } = await supabase.from("doctors").select("id, full_name, specialty");
      if (error) throw error;
      return data;
    },
  });

  const { data: treatments } = useQuery({
    queryKey: ["treatments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("treatments").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: subTreatments } = useQuery({
    queryKey: ["sub-treatments", treatmentRecord.treatment_id],
    queryFn: async () => {
      if (!treatmentRecord.treatment_id) return [];
      const { data, error } = await supabase
        .from("sub_treatments")
        .select("*")
        .eq("treatment_id", treatmentRecord.treatment_id);
      if (error) throw error;
      return data;
    },
    enabled: !!treatmentRecord.treatment_id,
  });

  // Query to get steps for selected sub-treatment
  const { data: treatmentSteps } = useQuery({
    queryKey: ["treatment-steps", treatmentRecord.sub_treatment_id],
    queryFn: async () => {
      if (!treatmentRecord.sub_treatment_id) return [];
      const { data, error } = await supabase
        .from("sub_treatment_steps")
        .select("*")
        .eq("sub_treatment_id", treatmentRecord.sub_treatment_id)
        .order("step_order");
      if (error) throw error;
      return data;
    },
    enabled: !!treatmentRecord.sub_treatment_id,
  });

  // Query to get completed steps for an appointment
  const { data: completedSteps } = useQuery({
    queryKey: ["completed-steps", selectedAppointment?.id],
    queryFn: async () => {
      if (!selectedAppointment?.id) return [];
      const { data, error } = await supabase
        .from("appointment_treatment_steps")
        .select("*")
        .eq("appointment_id", selectedAppointment.id);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedAppointment?.id,
  });

  // Query to get unfinished treatments for a patient
  const { data: unfinishedTreatments, error: unfinishedError } = useQuery({
    queryKey: ["unfinished-treatments", selectedAppointment?.patient_id],
    queryFn: async () => {
      if (!selectedAppointment?.patient_id) return [];

      // Get all treatment records for this patient by joining through appointments
      const { data: allRecords, error: recordsError } = await supabase
        .from("treatment_records")
        .select(`
          *,
          treatments (name),
          sub_treatments (name),
          appointments!inner (patient_id)
        `)
        .eq("appointments.patient_id", selectedAppointment.patient_id);

      if (recordsError) {
        console.error("Error fetching treatment records:", recordsError);
        throw recordsError;
      }

      console.log("All treatment records for patient:", allRecords);

      // Filter for incomplete records (is_completed is false or null)
      const incompleteRecords = allRecords?.filter(record =>
        record.is_completed === false || record.is_completed === null
      ) || [];

      console.log("Incomplete records:", incompleteRecords);

      return incompleteRecords.map(record => ({
        ...record,
        treatment_name: record.treatments?.name,
        sub_treatment_name: record.sub_treatments?.name,
        patient_id: selectedAppointment.patient_id
      }));
    },
    enabled: !!selectedAppointment?.patient_id,
  });

  // Query to get treatment plans for a patient
  const { data: treatmentPlans } = useQuery({
    queryKey: ["treatment-plans", selectedAppointment?.patient_id],
    queryFn: async () => {
      if (!selectedAppointment?.patient_id) return [];
      const { data, error } = await supabase
        .from("treatment_plans")
        .select(`
          *,
          treatments (name),
          sub_treatments (name)
        `)
        .eq("patient_id", selectedAppointment.patient_id)
        .eq("is_executed", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedAppointment?.patient_id,
  });

  // Query to get steps for selected treatment plan
  const { data: planTreatmentSteps } = useQuery({
    queryKey: ["plan-treatment-steps", selectedTreatmentPlan?.sub_treatment_id],
    queryFn: async () => {
      if (!selectedTreatmentPlan?.sub_treatment_id) return [];
      const { data, error } = await supabase
        .from("sub_treatment_steps")
        .select("*")
        .eq("sub_treatment_id", selectedTreatmentPlan.sub_treatment_id)
        .order("step_order");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedTreatmentPlan?.sub_treatment_id,
  });

  // Query to get sub_treatment details for the selected plan
  const { data: planSubTreatmentDetails } = useQuery({
    queryKey: ["plan-sub-treatment-details", selectedTreatmentPlan?.sub_treatment_id],
    queryFn: async () => {
      if (!selectedTreatmentPlan?.sub_treatment_id) return null;
      const { data, error } = await supabase
        .from("sub_treatments")
        .select("*")
        .eq("id", selectedTreatmentPlan.sub_treatment_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedTreatmentPlan?.sub_treatment_id,
  });

  // Auto-fill actual_cost when treatment plan is selected
  useEffect(() => {
    if (selectedTreatmentPlan && planSubTreatmentDetails) {
      setPlanExecution(prev => ({
        ...prev,
        actual_cost_syp: planSubTreatmentDetails.estimated_cost_syp?.toString().replace(/,/g, '') || "",
        actual_cost_usd: planSubTreatmentDetails.estimated_cost_usd?.toString().replace(/,/g, '') || ""
      }));
    }
  }, [selectedTreatmentPlan, planSubTreatmentDetails]);

  // Query to get steps for the selected treatment record
  const { data: resumeTreatmentSteps } = useQuery({
    queryKey: ["resume-treatment-steps", selectedTreatmentRecord?.sub_treatment_id],
    queryFn: async () => {
      if (!selectedTreatmentRecord?.sub_treatment_id) return [];
      const { data, error } = await supabase
        .from("sub_treatment_steps")
        .select("*")
        .eq("sub_treatment_id", selectedTreatmentRecord.sub_treatment_id)
        .order("step_order");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedTreatmentRecord?.sub_treatment_id,
  });

  // Query to get completed steps for the selected treatment record
  const { data: resumeCompletedSteps } = useQuery({
    queryKey: ["resume-completed-steps", selectedTreatmentRecord?.appointment_id],
    queryFn: async () => {
      if (!selectedTreatmentRecord?.appointment_id) return [];
      const { data, error } = await supabase
        .from("appointment_treatment_steps")
        .select("*")
        .eq("appointment_id", selectedTreatmentRecord.appointment_id);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedTreatmentRecord?.appointment_id,
  });

  const createAppointmentMutation = useMutation({
    mutationFn: async (appointment: typeof newAppointment) => {
      // Convert local datetime to ISO string for proper timezone handling
      const scheduledDate = new Date(appointment.scheduled_at);
      const appointmentData = {
        ...appointment,
        scheduled_at: scheduledDate.toISOString()
      };
      const { data, error } = await supabase.from("appointments").insert([appointmentData]).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      setIsDialogOpen(false);
      setNewAppointment({ patient_id: "", doctor_id: "", scheduled_at: "", notes: "" });
      toast({ title: "Success", description: "Appointment created successfully" });
    },
  });

  const updateAppointmentMutation = useMutation({
    mutationFn: async (appointment: typeof newAppointment & { id: string }) => {
      // Convert local datetime to ISO string for proper timezone handling
      const scheduledDate = new Date(appointment.scheduled_at);
      const { data, error } = await supabase
        .from("appointments")
        .update({
          patient_id: appointment.patient_id,
          doctor_id: appointment.doctor_id,
          scheduled_at: scheduledDate.toISOString(),
          notes: appointment.notes,
        })
        .eq("id", appointment.id)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      setIsDialogOpen(false);
      setEditingAppointment(null);
      setNewAppointment({ patient_id: "", doctor_id: "", scheduled_at: "", notes: "" });
      toast({ title: "نجح", description: "تم تحديث الموعد بنجاح" });
    },
  });

  const deleteAppointmentMutation = useMutation({
    mutationFn: async (appointmentId: string) => {
      const { error } = await supabase.from("appointments").delete().eq("id", appointmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast({ title: "نجح", description: "تم حذف الموعد بنجاح" });
    },
  });

  // Function to preview bulk delete data
  const previewBulkDelete = async () => {
    if (!bulkDeleteStartDate || !bulkDeleteEndDate) {
      toast({ title: "خطأ", description: "يرجى تحديد تاريخ البداية والنهاية", variant: "destructive" });
      return;
    }

    const startOfDay = new Date(bulkDeleteStartDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(bulkDeleteEndDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Fetch appointments in date range
    const { data: appointmentsToDelete, error: aptError } = await supabase
      .from("appointments")
      .select(`
        *,
        patients (full_name, phone_number),
        doctors (full_name, specialty)
      `)
      .gte("scheduled_at", startOfDay.toISOString())
      .lte("scheduled_at", endOfDay.toISOString());

    if (aptError) {
      toast({ title: "خطأ", description: "فشل في جلب المواعيد", variant: "destructive" });
      return;
    }

    if (!appointmentsToDelete || appointmentsToDelete.length === 0) {
      toast({ title: "لا توجد مواعيد", description: "لا توجد مواعيد في هذا النطاق الزمني", variant: "destructive" });
      return;
    }

    const appointmentIds = appointmentsToDelete.map(a => a.id);

    // Fetch payments for these appointments
    const { data: paymentsToDelete, error: payError } = await supabase
      .from("payments")
      .select(`
        *,
        appointments!inner (
          scheduled_at,
          patients (full_name)
        )
      `)
      .in("appointment_id", appointmentIds);

    if (payError) {
      toast({ title: "خطأ", description: "فشل في جلب الدفعات", variant: "destructive" });
      return;
    }

    // Fetch treatment records for these appointments
    const { data: treatmentsToDelete, error: treatError } = await supabase
      .from("treatment_records")
      .select(`
        *,
        treatments (name),
        sub_treatments (name),
        appointments!inner (
          scheduled_at,
          patients (full_name)
        )
      `)
      .in("appointment_id", appointmentIds);

    if (treatError) {
      toast({ title: "خطأ", description: "فشل في جلب العلاجات", variant: "destructive" });
      return;
    }

    setBulkDeletePreview({
      appointments: appointmentsToDelete,
      payments: paymentsToDelete || [],
      treatments: treatmentsToDelete || [],
    });

    setIsBulkDeleteConfirmOpen(true);
  };

  // Function to export deleted data and perform bulk delete
  const executeBulkDelete = async () => {
    if (!bulkDeletePreview) return;

    const { appointments: appointmentsToDelete, payments: paymentsToDelete, treatments: treatmentsToDelete } = bulkDeletePreview;

    // Create Excel workbook with deleted data
    const wb = XLSX.utils.book_new();

    // Appointments sheet
    if (appointmentsToDelete.length > 0) {
      const appointmentsData = appointmentsToDelete.map((apt: any) => ({
        'التاريخ': format(new Date(apt.scheduled_at), 'dd/MM/yyyy'),
        'الوقت': new Date(apt.scheduled_at).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }),
        'اسم المريض': apt.patients?.full_name || '-',
        'رقم الهاتف': apt.patients?.phone_number || '-',
        'الطبيب': apt.doctors?.full_name || '-',
        'التخصص': apt.doctors?.specialty || '-',
        'الحالة': apt.status === 'Completed' ? 'مكتمل' : apt.status === 'Scheduled' ? 'مجدول' : 'ملغي',
        'ملاحظات': apt.notes || '-',
      }));
      const ws1 = XLSX.utils.json_to_sheet(appointmentsData);
      XLSX.utils.book_append_sheet(wb, ws1, 'المواعيد المحذوفة');
    }

    // Payments sheet
    if (paymentsToDelete.length > 0) {
      const paymentsData = paymentsToDelete.map((pay: any) => ({
        'تاريخ الدفع': format(new Date(pay.paid_at), 'dd/MM/yyyy'),
        'المبلغ': pay.amount,
        'اسم المريض': pay.appointments?.patients?.full_name || '-',
        'تاريخ الموعد': format(new Date(pay.appointments?.scheduled_at), 'dd/MM/yyyy'),
      }));
      const ws2 = XLSX.utils.json_to_sheet(paymentsData);
      XLSX.utils.book_append_sheet(wb, ws2, 'الدفعات المحذوفة');
    }

    // Treatment records sheet
    if (treatmentsToDelete.length > 0) {
      const treatmentsData = treatmentsToDelete.map((tr: any) => ({
        'تاريخ العلاج': format(new Date(tr.performed_at), 'dd/MM/yyyy'),
        'اسم المريض': tr.appointments?.patients?.full_name || '-',
        'العلاج': tr.treatments?.name || '-',
        'العلاج الفرعي': tr.sub_treatments?.name || '-',
        'رقم السن': tr.tooth_number || '-',
        'التكلفة': tr.actual_cost || '-',
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

    // Now delete the data - order matters due to foreign keys
    const appointmentIds = appointmentsToDelete.map((a: any) => a.id);

    // Delete appointment_treatment_steps
    await supabase
      .from("appointment_treatment_steps")
      .delete()
      .in("appointment_id", appointmentIds);

    // Delete treatment_records
    await supabase
      .from("treatment_records")
      .delete()
      .in("appointment_id", appointmentIds);

    // Delete payments
    await supabase
      .from("payments")
      .delete()
      .in("appointment_id", appointmentIds);

    // Delete treatment_plans linked to these appointments
    await supabase
      .from("treatment_plans")
      .delete()
      .in("appointment_id", appointmentIds);

    // Delete unfinished_sub_treatments linked to these appointments
    await supabase
      .from("unfinished_sub_treatments")
      .delete()
      .in("last_appointment_id", appointmentIds);

    // Delete waiting_list entries
    await supabase
      .from("waiting_list")
      .delete()
      .in("appointment_id", appointmentIds);

    // Finally delete appointments
    const { error } = await supabase
      .from("appointments")
      .delete()
      .in("id", appointmentIds);

    if (error) {
      toast({ title: "خطأ", description: "فشل في حذف المواعيد", variant: "destructive" });
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
      description: `تم حذف ${appointmentsToDelete.length} موعد و ${paymentsToDelete.length} دفعة و ${treatmentsToDelete.length} سجل علاج وتصدير البيانات`
    });
  };

  // Mutation to add payment
  const addPaymentMutation = useMutation({
    mutationFn: async ({ appointmentId, amount, currency }: { appointmentId: string; amount: number; currency: string }) => {
      const { data, error } = await supabase
        .from("payments")
        .insert([{
          appointment_id: appointmentId,
          amount: amount,
          currency: currency,
          paid_at: new Date().toISOString()
        }])
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      setIsAddPaymentDialogOpen(false);
      setNewPaymentAmount("");
      setNewPaymentCurrency("SYP");
      toast({ title: "نجح", description: "تم تسجيل الدفعة بنجاح" });
    },
    onError: () => {
      toast({ title: "خطأ", description: "فشل في تسجيل الدفعة", variant: "destructive" });
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

  const recordTreatmentMutation = useMutation({
    mutationFn: async (record: typeof treatmentRecord) => {
      // Check if all steps are completed
      const allSteps = treatmentSteps || [];
      const isCompleted = allSteps.length === 0 || (selectedSteps.length === allSteps.length);

      // Insert treatment record
      const { data, error } = await supabase
        .from("treatment_records")
        .insert([{
          treatment_id: record.treatment_id,
          sub_treatment_id: record.sub_treatment_id,
          tooth_number: record.tooth_numbers.join(", "),
          appointment_id: selectedAppointment.id,
          actual_cost_syp: record.actual_cost_syp ? parseFloat(record.actual_cost_syp) : 0,
          actual_cost_usd: record.actual_cost_usd ? parseFloat(record.actual_cost_usd) : 0,
          performed_at: new Date().toISOString(),
          is_completed: isCompleted,
          treatment_notes: record.treatment_notes || null
        }])
        .select();
      if (error) throw error;

      // Update appointment notes
      if (record.notes.trim()) {
        const { error: notesError } = await supabase
          .from("appointments")
          .update({ notes: record.notes })
          .eq("id", selectedAppointment.id);
        if (notesError) throw notesError;
      }

      // Save completed treatment steps if any are selected
      if (selectedSteps.length > 0) {
        const stepData = selectedSteps.map(stepId => ({
          appointment_id: selectedAppointment.id,
          sub_treatment_step_id: stepId,
          is_completed: true,
          completed_at: new Date().toISOString()
        }));

        const { error: stepsError } = await supabase
          .from("appointment_treatment_steps")
          .insert(stepData);
        if (stepsError) throw stepsError;
      }

      // Add payment if payment_amount is provided
      if (record.payment_amount && parseFloat(record.payment_amount) > 0) {
        const { error: paymentError } = await supabase
          .from("payments")
          .insert({
            appointment_id: selectedAppointment.id,
            amount: parseFloat(record.payment_amount),
            currency: record.payment_currency,
            paid_at: new Date().toISOString()
          });
        if (paymentError) throw paymentError;
      }

      // If treatment is not completed, add to unfinished_sub_treatments
      if (!isCompleted) {
        const { error: unfinishedError } = await supabase
          .from("unfinished_sub_treatments")
          .insert({
            patient_id: selectedAppointment.patient_id,
            treatment_id: record.treatment_id,
            sub_treatment_id: record.sub_treatment_id,
            tooth_number: record.tooth_numbers.join(", "),
            last_appointment_id: selectedAppointment.id,
            notes: record.notes || null,
            started_at: new Date().toISOString()
          });
        if (unfinishedError) throw unfinishedError;
      }

      return data;
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
  });

  // Mutation to save treatment steps
  const saveStepsMutation = useMutation({
    mutationFn: async (steps: string[]) => {
      if (!selectedAppointment?.id) throw new Error("No appointment selected");

      // Delete existing steps for this appointment
      await supabase
        .from("appointment_treatment_steps")
        .delete()
        .eq("appointment_id", selectedAppointment.id);

      // Insert new steps
      if (steps.length > 0) {
        const stepData = steps.map(stepId => ({
          appointment_id: selectedAppointment.id,
          sub_treatment_step_id: stepId,
          is_completed: true,
          completed_at: new Date().toISOString()
        }));

        const { error } = await supabase
          .from("appointment_treatment_steps")
          .insert(stepData);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["completed-steps"] });
      setIsStepsDialogOpen(false);
      setSelectedSteps([]);
      toast({ title: "نجح", description: "تم حفظ خطوات العلاج بنجاح" });
    },
  });

  // Mutation to resume treatment steps
  const resumeStepsMutation = useMutation({
    mutationFn: async (steps: string[]) => {
      if (!selectedTreatmentRecord?.appointment_id) throw new Error("No treatment record selected");

      // Insert new completed steps for the current appointment
      if (steps.length > 0) {
        const stepData = steps.map(stepId => ({
          appointment_id: selectedAppointment.id,
          sub_treatment_step_id: stepId,
          is_completed: true,
          completed_at: new Date().toISOString()
        }));

        const { error } = await supabase
          .from("appointment_treatment_steps")
          .insert(stepData);
        if (error) throw error;
      }

      // Check if all steps are completed
      const allSteps = resumeTreatmentSteps || [];
      const previouslyCompletedIds = (resumeCompletedSteps || [])
        .map(cs => (cs as any).sub_treatment_step_id)
        .filter(Boolean);
      const currentStepIds = steps || [];
      const allCompletedStepIds = [...previouslyCompletedIds, ...currentStepIds];
      const allStepsCompleted = allSteps.length > 0 && allSteps.every(step => allCompletedStepIds.includes(step.id));

      // Update treatment_notes if provided - append to existing notes
      if (resumeTreatmentNotes.trim()) {
        const existingNotes = selectedTreatmentRecord.treatment_notes || "";
        const updatedNotes = existingNotes
          ? `${existingNotes}\n\n--- ${format(new Date(), 'dd/MM/yyyy')} ---\n${resumeTreatmentNotes}`
          : resumeTreatmentNotes;

        await supabase
          .from("treatment_records")
          .update({
            treatment_notes: updatedNotes,
            is_completed: allStepsCompleted,
            updated_at: new Date().toISOString()
          })
          .eq("id", selectedTreatmentRecord.id);
      } else if (allStepsCompleted) {
        // Mark original treatment as completed even if no new notes
        await supabase
          .from("treatment_records")
          .update({
            is_completed: true,
            updated_at: new Date().toISOString()
          })
          .eq("id", selectedTreatmentRecord.id);
      }

      // Create a new treatment record for the current appointment to show in appointments history
      await supabase
        .from("treatment_records")
        .insert({
          appointment_id: selectedAppointment.id,
          treatment_id: selectedTreatmentRecord.treatment_id,
          sub_treatment_id: selectedTreatmentRecord.sub_treatment_id,
          tooth_number: selectedTreatmentRecord.tooth_number,
          actual_cost_syp: 0, // No additional cost for continuation session
          actual_cost_usd: 0,
          is_completed: allStepsCompleted,
          treatment_notes: resumeTreatmentNotes || `استكمال العلاج - ${format(new Date(), 'dd/MM/yyyy')}`,
          performed_at: new Date().toISOString(),
        });

      if (allStepsCompleted) {
        // Remove from unfinished_sub_treatments
        await supabase
          .from("unfinished_sub_treatments")
          .delete()
          .eq("patient_id", selectedAppointment.patient_id)
          .eq("treatment_id", selectedTreatmentRecord.treatment_id)
          .eq("sub_treatment_id", selectedTreatmentRecord.sub_treatment_id)
          .eq("tooth_number", selectedTreatmentRecord.tooth_number);
      } else {
        // Update last_appointment_id in unfinished_sub_treatments
        await supabase
          .from("unfinished_sub_treatments")
          .update({
            last_appointment_id: selectedAppointment.id,
            updated_at: new Date().toISOString()
          })
          .eq("patient_id", selectedAppointment.patient_id)
          .eq("treatment_id", selectedTreatmentRecord.treatment_id)
          .eq("sub_treatment_id", selectedTreatmentRecord.sub_treatment_id)
          .eq("tooth_number", selectedTreatmentRecord.tooth_number);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unfinished-treatments"] });
      queryClient.invalidateQueries({ queryKey: ["resume-completed-steps"] });
      setIsResumeDialogOpen(false);
      setSelectedSteps([]);
      setSelectedTreatmentRecord(null);
      setResumeTreatmentNotes("");
      toast({ title: "نجح", description: "تم استكمال خطوات العلاج بنجاح" });
    },
  });

  // Mutation to execute treatment plan
  const executePlanMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTreatmentPlan) throw new Error("No treatment plan selected");

      // Check if all steps are completed
      const allSteps = planTreatmentSteps || [];
      const isCompleted = allSteps.length === 0 || (selectedSteps.length === allSteps.length);

      // Get existing treatment notes for this treatment if any
      let existingNotes = "";
      if (planExecution.treatment_notes.trim()) {
        const { data: existingRecords } = await supabase
          .from("treatment_records")
          .select("treatment_notes")
          .eq("treatment_id", selectedTreatmentPlan.treatment_id)
          .eq("sub_treatment_id", selectedTreatmentPlan.sub_treatment_id)
          .eq("tooth_number", selectedTreatmentPlan.tooth_number)
          .order("performed_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingRecords?.treatment_notes) {
          existingNotes = existingRecords.treatment_notes;
        }
      }

      // Append new notes to existing notes
      const updatedNotes = planExecution.treatment_notes.trim()
        ? existingNotes
          ? `${existingNotes}\n\n--- ${format(new Date(), 'dd/MM/yyyy')} ---\n${planExecution.treatment_notes}`
          : planExecution.treatment_notes
        : null;

      // Create treatment record
      const { data: recordData, error: recordError } = await supabase
        .from("treatment_records")
        .insert([{
          treatment_id: selectedTreatmentPlan.treatment_id,
          sub_treatment_id: selectedTreatmentPlan.sub_treatment_id,
          tooth_number: selectedTreatmentPlan.tooth_number,
          appointment_id: selectedAppointment.id,
          actual_cost_syp: planExecution.actual_cost_syp ? parseFloat(planExecution.actual_cost_syp) : 0,
          actual_cost_usd: planExecution.actual_cost_usd ? parseFloat(planExecution.actual_cost_usd) : 0,
          performed_at: new Date().toISOString(),
          is_completed: isCompleted,
          treatment_notes: updatedNotes
        }])
        .select();
      if (recordError) throw recordError;

      // Update appointment notes if provided
      if (planExecution.notes.trim()) {
        const { error: notesError } = await supabase
          .from("appointments")
          .update({ notes: planExecution.notes })
          .eq("id", selectedAppointment.id);
        if (notesError) throw notesError;
      }

      // Save completed treatment steps if any are selected
      if (selectedSteps.length > 0) {
        const stepData = selectedSteps.map(stepId => ({
          appointment_id: selectedAppointment.id,
          sub_treatment_step_id: stepId,
          is_completed: true,
          completed_at: new Date().toISOString()
        }));

        const { error: stepsError } = await supabase
          .from("appointment_treatment_steps")
          .insert(stepData);
        if (stepsError) throw stepsError;
      }

      // Add payment if payment_amount is provided
      if (planExecution.payment_amount && parseFloat(planExecution.payment_amount) > 0) {
        const { error: paymentError } = await supabase
          .from("payments")
          .insert({
            appointment_id: selectedAppointment.id,
            amount: parseFloat(planExecution.payment_amount),
            currency: planExecution.payment_currency,
            paid_at: new Date().toISOString()
          });
        if (paymentError) throw paymentError;
      }

      // If treatment is not completed, add to unfinished_sub_treatments
      if (!isCompleted) {
        const { error: unfinishedError } = await supabase
          .from("unfinished_sub_treatments")
          .insert({
            patient_id: selectedAppointment.patient_id,
            treatment_id: selectedTreatmentPlan.treatment_id,
            sub_treatment_id: selectedTreatmentPlan.sub_treatment_id,
            tooth_number: selectedTreatmentPlan.tooth_number,
            last_appointment_id: selectedAppointment.id,
            notes: planExecution.notes || null,
            started_at: new Date().toISOString()
          });
        if (unfinishedError) throw unfinishedError;
      }

      // Mark treatment plan as executed
      const { error: planError } = await supabase
        .from("treatment_plans")
        .update({
          is_executed: true,
          executed_at: new Date().toISOString(),
          appointment_id: selectedAppointment.id
        })
        .eq("id", selectedTreatmentPlan.id);
      if (planError) throw planError;

      return recordData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["treatment-plans"] });
      queryClient.invalidateQueries({ queryKey: ["unfinished-treatments"] });
      setIsExecutePlanDetailsDialogOpen(false);
      setIsExecutePlanDialogOpen(false);
      setSelectedTreatmentPlan(null);
      setPlanExecution({ actual_cost_syp: "", actual_cost_usd: "", payment_amount: "", payment_currency: "SYP", notes: "", treatment_notes: "" });
      setSelectedSteps([]);
      toast({ title: "نجح", description: "تم تنفيذ خطة العلاج بنجاح" });
    },
  });

  const updateAppointmentStatus = async (appointmentId: string, status: "Scheduled" | "Completed" | "Cancelled") => {
    const { error } = await supabase
      .from("appointments")
      .update({ status })
      .eq("id", appointmentId);

    if (error) {
      toast({ title: "Error", description: "Failed to update appointment", variant: "destructive" });
    } else {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast({ title: "Success", description: "Appointment updated successfully" });
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

  const handleExportToExcel = () => {
    if (!appointments || appointments.length === 0) {
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
    const appointmentsByDate: { [key: string]: any[] } = {};

    appointments.forEach(apt => {
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
        const row: any = {};

        if (selectedColumns.includes('patient_name')) {
          row['اسم المريض'] = apt.patients?.full_name || '';
        }
        if (selectedColumns.includes('phone_number')) {
          row['رقم الهاتف'] = apt.patients?.phone_number || '';
        }
        if (selectedColumns.includes('doctor_name')) {
          row['الطبيب'] = apt.doctors?.full_name || '';
        }
        if (selectedColumns.includes('specialty')) {
          row['التخصص'] = apt.doctors?.specialty || '';
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
      const sheetName = date.substring(0, 31).replace(/[:\\/?*\[\]]/g, '-');
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
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        if (jsonData.length === 0) {
          toast({
            title: "خطأ",
            description: "الملف فارغ",
            variant: "destructive"
          });
          return;
        }

        // Process and validate imported data
        let successCount = 0;
        let errorCount = 0;

        for (const row of jsonData as any[]) {
          try {
            // Find patient by name
            const patient = patients?.find(p => p.full_name === row['اسم المريض']);
            if (!patient) {
              errorCount++;
              continue;
            }

            // Find doctor by name
            const doctor = doctors?.find(d => d.full_name === row['الطبيب']);
            if (!doctor) {
              errorCount++;
              continue;
            }

            // Parse date and time
            const dateStr = row['التاريخ'];
            const timeStr = row['الوقت'];
            if (!dateStr || !timeStr) {
              errorCount++;
              continue;
            }

            // Create appointment
            const { error } = await supabase.from("appointments").insert({
              patient_id: patient.id,
              doctor_id: doctor.id,
              scheduled_at: new Date(`${dateStr} ${timeStr}`).toISOString(),
              notes: row['ملاحظات'] || '',
              status: row['الحالة'] || 'Scheduled'
            });

            if (error) {
              errorCount++;
            } else {
              successCount++;
            }
          } catch (err) {
            errorCount++;
          }
        }

        queryClient.invalidateQueries({ queryKey: ["appointments"] });

        toast({
          title: "اكتمل الاستيراد",
          description: `تم استيراد ${successCount} موعد بنجاح. فشل: ${errorCount}`,
        });
      } catch (error) {
        toast({
          title: "خطأ",
          description: "فشل استيراد الملف",
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


  const sendWhatsAppMessage = (appointment: any) => {
    if (!appointment.patients?.phone_number) {
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

    const message = `مرحباً ${appointment.patients.full_name}،

نذكركم بموعدكم في العيادة:
📅 التاريخ: ${formattedDate}
🕐 الوقت: ${formattedTime}
👨‍⚕️ الطبيب: ${appointment.doctors?.full_name}
🏥 التخصص: ${appointment.doctors?.specialty}

${appointment.notes ? `📝 ملاحظات: ${appointment.notes}` : ''}

يرجى الحضور قبل الموعد بـ 15 دقيقة.

شكراً لكم`;

    const phoneNumber = appointment.patients.phone_number.replace(/[^0-9]/g, '');
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
                setNewAppointment({ patient_id: "", doctor_id: "", scheduled_at: "", notes: "" });
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
                            ? (editingAppointment?.patients?.full_name ||
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
                                - {apt.doctors?.full_name}
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
                    <Select value={newAppointment.doctor_id} onValueChange={(value) => setNewAppointment({ ...newAppointment, doctor_id: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="اختر طبيب" />
                      </SelectTrigger>
                      <SelectContent>
                        {doctors?.map((doctor) => (
                          <SelectItem key={doctor.id} value={doctor.id}>
                            {doctor.full_name} - {doctor.specialty}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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
                        <TableCell>
                          {format(new Date(appointment.scheduled_at), 'dd/MM/yyyy')}
                          {' - '}
                          {new Date(appointment.scheduled_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                        </TableCell>
                      )}
                      {visibleTableColumns.includes('patient_name') && (
                        <TableCell>{appointment.patients?.full_name}</TableCell>
                      )}
                      {visibleTableColumns.includes('doctor_info') && (
                        <TableCell className="hidden md:table-cell">
                          {appointment.doctors?.full_name}
                          <br />
                          <span className="text-sm text-muted-foreground">
                            {appointment.doctors?.specialty}
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
                                  onClick={() => {
                                    setEditingAppointment(appointment);
                                    setNewAppointment({
                                      patient_id: appointment.patient_id,
                                      doctor_id: appointment.doctor_id,
                                      scheduled_at: formatDateForInput(appointment.scheduled_at),
                                      notes: appointment.notes || "",
                                    });
                                    setIsDialogOpen(true);
                                  }}
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
                    const selectedSubTreatment = subTreatments?.find(st => st.id === value);
                    setTreatmentRecord({
                      ...treatmentRecord,
                      sub_treatment_id: value,
                      actual_cost_syp: selectedSubTreatment?.estimated_cost_syp?.toString().replace(/,/g, '') || "",
                      actual_cost_usd: selectedSubTreatment?.estimated_cost_usd?.toString().replace(/,/g, '') || "",
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
              const selectedSubTreatment = subTreatments?.find(st => st.id === treatmentRecord.sub_treatment_id);
              const toothAssociation = selectedSubTreatment?.tooth_association || "not_related";
              const isToothSelectionEnabled = toothAssociation !== "not_related";
              const isSingleToothOnly = toothAssociation === "single_tooth";

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
                    const isCompleted = completedSteps?.some(
                      cs => cs.sub_treatment_step_id === step.id
                    );
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
            <DialogTitle>استكمال علاج - {selectedAppointment?.patients?.full_name}</DialogTitle>
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
                            <h4 className="font-semibold">{treatment.treatment_name}</h4>
                            <p className="text-sm text-muted-foreground">{treatment.sub_treatment_name}</p>
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
                      const isCompleted = resumeCompletedSteps?.some(
                        cs => cs.sub_treatment_step_id === step.id
                      );
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
                {treatmentPlans.map((plan: any) => (
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
                        <p className="font-medium">{plan.treatments?.name}</p>
                        <p className="text-sm text-muted-foreground">{plan.sub_treatments?.name}</p>
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
                  <p className="text-sm font-medium">{selectedTreatmentPlan.treatments?.name} - {selectedTreatmentPlan.sub_treatments?.name}</p>
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
                    onClick={async () => {
                      if (window.confirm("هل أنت متأكد من حذف هذه الخطة؟")) {
                        const { error } = await supabase
                          .from("treatment_plans")
                          .delete()
                          .eq("id", selectedTreatmentPlan.id);
                        if (error) {
                          toast({ title: "خطأ", description: "فشل في حذف الخطة", variant: "destructive" });
                        } else {
                          queryClient.invalidateQueries({ queryKey: ["treatment-plans"] });
                          setIsExecutePlanDetailsDialogOpen(false);
                          setSelectedTreatmentPlan(null);
                          toast({ title: "نجح", description: "تم حذف الخطة بنجاح" });
                        }
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
                    {planTreatmentSteps.map((step: any) => (
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
                <div><span className="font-medium">المريض:</span> {selectedAppointment.patients?.full_name}</div>
                <div><span className="font-medium">الطبيب:</span> {selectedAppointment.doctors?.full_name}</div>
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
                    setEditingAppointment(selectedAppointment);
                    setNewAppointment({
                      patient_id: selectedAppointment.patient_id,
                      doctor_id: selectedAppointment.doctor_id,
                      scheduled_at: formatDateForInput(selectedAppointment.scheduled_at),
                      notes: selectedAppointment.notes || "",
                    });
                    setIsDialogOpen(true);
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
                      <span className="font-bold text-destructive">{bulkDeletePreview.treatments.length}</span>
                    </div>
                    {bulkDeletePreview.payments.length > 0 && (
                      <div className="flex justify-between border-t pt-2 mt-2">
                        <span>إجمالي المبالغ:</span>
                        <span className="font-bold">
                          {bulkDeletePreview.payments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0).toLocaleString()}
                        </span>
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
                <div><span className="font-medium">المريض:</span> {selectedAppointment.patients?.full_name}</div>
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