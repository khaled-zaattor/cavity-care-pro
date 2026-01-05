import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Plus, Calendar, CreditCard, Edit, Download, Trash2, FileText } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import * as XLSX from 'xlsx';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useUserRole } from "@/hooks/useUserRole";

export default function PatientProfile() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canManagePayments } = useUserRole();

  const [isAppointmentDialogOpen, setIsAppointmentDialogOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isEditPaymentDialogOpen, setIsEditPaymentDialogOpen] = useState(false);
  const [isTreatmentPlanDialogOpen, setIsTreatmentPlanDialogOpen] = useState(false);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState("");
  const [activeSection, setActiveSection] = useState("all"); // "all", "appointments", "treatments", "payments"
  const [editingPayments, setEditingPayments] = useState<{[key: string]: string}>({});
  const [isDeleteTreatmentDialogOpen, setIsDeleteTreatmentDialogOpen] = useState(false);
  const [treatmentToDelete, setTreatmentToDelete] = useState<string | null>(null);
  const [isEditTreatmentCostDialogOpen, setIsEditTreatmentCostDialogOpen] = useState(false);
  const [selectedTreatmentRecord, setSelectedTreatmentRecord] = useState<any>(null);
  const [editingTreatmentCostSyp, setEditingTreatmentCostSyp] = useState("");
  const [editingTreatmentCostUsd, setEditingTreatmentCostUsd] = useState("");

  const [treatmentPlan, setTreatmentPlan] = useState({
    treatment_id: "",
    sub_treatment_id: "",
    tooth_number: "",
  });
  const [planTeethType, setPlanTeethType] = useState<"adult" | "child">("adult");

  const [newAppointment, setNewAppointment] = useState({
    doctor_id: "",
    scheduled_at: "",
    notes: "",
  });

  const [newPayment, setNewPayment] = useState({
    amount: "",
    currency: "SYP" as "SYP" | "USD",
  });

  // Fetch patient data
  const { data: patient } = useQuery({
    queryKey: ["patient", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("*")
        .eq("id", patientId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Query to get future appointments for this patient
  const { data: patientFutureAppointments } = useQuery({
    queryKey: ["patient-future-appointments", patientId],
    queryFn: async () => {
      if (!patientId) return [];
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("appointments")
        .select(`
          id,
          scheduled_at,
          status,
          doctors (full_name)
        `)
        .eq("patient_id", patientId)
        .gte("scheduled_at", now)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!patientId,
  });

  // Fetch doctors
  const { data: doctors } = useQuery({
    queryKey: ["doctors"],
    queryFn: async () => {
      const { data, error } = await supabase.from("doctors").select("*");
      if (error) throw error;
      return data;
    },
  });

  // Fetch treatments
  const { data: treatments } = useQuery({
    queryKey: ["treatments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("treatments").select("*");
      if (error) throw error;
      return data;
    },
  });

  // Fetch sub-treatments
  const { data: subTreatments } = useQuery({
    queryKey: ["sub-treatments", treatmentPlan.treatment_id],
    queryFn: async () => {
      if (!treatmentPlan.treatment_id) return [];
      const { data, error } = await supabase
        .from("sub_treatments")
        .select("*")
        .eq("treatment_id", treatmentPlan.treatment_id);
      if (error) throw error;
      return data;
    },
    enabled: !!treatmentPlan.treatment_id,
  });

  // Mutation to mark sub-treatment as completed
  const markCompleteMutation = useMutation({
    mutationFn: async (recordId: string) => {
      const { error } = await supabase
        .from("treatment_records")
        .update({ is_completed: true })
        .eq("id", recordId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unfinished-sub-treatments", patientId] });
      queryClient.invalidateQueries({ queryKey: ["patient-balance", patientId] });
      toast({ title: "تم", description: "تم وضع علامة مكتمل" });
    },
  });

  // Mutation to delete treatment record
  const deleteTreatmentMutation = useMutation({
    mutationFn: async (recordId: string) => {
      const { error } = await supabase
        .from("treatment_records")
        .delete()
        .eq("id", recordId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-treatment-records", patientId] });
      queryClient.invalidateQueries({ queryKey: ["patient-balance", patientId] });
      setIsDeleteTreatmentDialogOpen(false);
      setTreatmentToDelete(null);
      toast({ title: "تم الحذف", description: "تم حذف العلاج بنجاح" });
    },
    onError: () => {
      toast({ 
        title: "خطأ", 
        description: "حدث خطأ أثناء حذف العلاج",
        variant: "destructive"
      });
    },
  });

  // Fetch unfinished sub-treatments
  const { data: unfinishedSubTreatments } = useQuery({
    queryKey: ["unfinished-sub-treatments", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("unfinished_sub_treatments")
        .select("id, sub_treatment_name, treatment_name, tooth_number")
        .eq("patient_id", patientId);
      if (error) throw error;
      return data;
    },
  });

  // Fetch appointments
  const { data: appointments } = useQuery({
    queryKey: ["patient-appointments", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(`
          *,
          doctors (full_name),
          payments (amount, paid_at),
          treatment_records (
            *,
            treatments (name),
            sub_treatments (name)
          )
        `)
        .eq("patient_id", patientId)
        .order("scheduled_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Calculate patient balance
  const { data: balance } = useQuery({
    queryKey: ["patient-balance", patientId],
    queryFn: async () => {
      const { data: treatmentRecords, error: trError } = await supabase
        .from("treatment_records")
        .select(`
          *,
          appointments!inner (patient_id)
        `)
        .eq("appointments.patient_id", patientId);

      const { data: payments, error: pError } = await supabase
        .from("payments")
        .select(`
          amount,
          currency,
          appointments!inner (patient_id)
        `)
        .eq("appointments.patient_id", patientId);

      if (trError || pError) throw trError || pError;

      const totalCostSyp = treatmentRecords?.reduce((sum, record) => sum + Number(record.actual_cost_syp || 0), 0) || 0;
      const totalCostUsd = treatmentRecords?.reduce((sum, record) => sum + Number(record.actual_cost_usd || 0), 0) || 0;
      const totalPaidSyp = payments?.filter(p => (p as any).currency === 'SYP' || !(p as any).currency).reduce((sum, payment) => sum + Number(payment.amount), 0) || 0;
      const totalPaidUsd = payments?.filter(p => (p as any).currency === 'USD').reduce((sum, payment) => sum + Number(payment.amount), 0) || 0;

      return {
        syp: totalCostSyp - totalPaidSyp,
        usd: totalCostUsd - totalPaidUsd,
      };
    },
  });

  // Fetch all treatment records for this patient
  const { data: allTreatmentRecords } = useQuery({
    queryKey: ["all-treatment-records", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treatment_records")
        .select(`
          *,
          treatments (name),
          sub_treatments (name),
          appointments!inner (
            patient_id, 
            scheduled_at,
            doctors (full_name),
            id
          )
        `)
        .eq("appointments.patient_id", patientId)
        .order("created_at", { ascending: false });
      if (error) throw error;

      // For each treatment record, fetch the executed steps for this specific sub_treatment
      const recordsWithSteps = await Promise.all(
        (data || []).map(async (record) => {
          const { data: steps, error: stepsError } = await supabase
            .from("appointment_treatment_steps")
            .select(`
              *,
              sub_treatment_step_id,
              sub_treatment_steps!inner (
                step_name,
                sub_treatment_id
              )
            `)
            .eq("appointment_id", record.appointments.id)
            .eq("sub_treatment_steps.sub_treatment_id", record.sub_treatment_id);

          if (stepsError) {
            console.error("Error fetching steps:", stepsError);
            return { ...record, executed_steps: [] };
          }

          return { ...record, executed_steps: steps || [] };
        })
      );

      return recordsWithSteps;
    },
  });

  // Fetch all payments for this patient
  const { data: allPayments } = useQuery({
    queryKey: ["all-payments", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select(`
          *,
          appointments!inner (
            patient_id, 
            scheduled_at,
            doctors (full_name)
          )
        `)
        .eq("appointments.patient_id", patientId)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createAppointmentMutation = useMutation({
    mutationFn: async (appointment: typeof newAppointment) => {
      const { data, error } = await supabase
        .from("appointments")
        .insert([{ ...appointment, patient_id: patientId }])
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-appointments", patientId] });
      setIsAppointmentDialogOpen(false);
      setNewAppointment({ doctor_id: "", scheduled_at: "", notes: "" });
      toast({ title: "نجح", description: "تم جدولة الموعد بنجاح" });
    },
  });

  const createPaymentMutation = useMutation({
    mutationFn: async (payment: typeof newPayment) => {
      const { data, error } = await supabase
        .from("payments")
        .insert([{ 
          appointment_id: selectedAppointmentId, 
          amount: parseFloat(payment.amount),
          currency: payment.currency
        }])
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-appointments", patientId] });
      queryClient.invalidateQueries({ queryKey: ["patient-balance", patientId] });
      queryClient.invalidateQueries({ queryKey: ["appointment-payments", selectedAppointmentId] });
      setIsPaymentDialogOpen(false);
      setNewPayment({ amount: "", currency: "SYP" });
      toast({ title: "نجح", description: "تم تسجيل الدفعة بنجاح" });
    },
  });

  // Fetch payments for a specific appointment
  const { data: appointmentPayments } = useQuery({
    queryKey: ["appointment-payments", selectedAppointmentId],
    queryFn: async () => {
      if (!selectedAppointmentId) return [];
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("appointment_id", selectedAppointmentId)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedAppointmentId,
  });

  // Update payment mutation
  const updatePaymentMutation = useMutation({
    mutationFn: async ({ paymentId, newAmount }: { paymentId: string; newAmount: number }) => {
      const { error } = await supabase
        .from("payments")
        .update({ amount: newAmount })
        .eq("id", paymentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-appointments", patientId] });
      queryClient.invalidateQueries({ queryKey: ["patient-balance", patientId] });
      queryClient.invalidateQueries({ queryKey: ["appointment-payments", selectedAppointmentId] });
      queryClient.invalidateQueries({ queryKey: ["all-payments", patientId] });
      toast({ title: "نجح", description: "تم تعديل الدفعة بنجاح" });
    },
  });

  // Update treatment cost mutation
  const updateTreatmentCostMutation = useMutation({
    mutationFn: async ({ treatmentRecordId, newCostSyp, newCostUsd }: { treatmentRecordId: string; newCostSyp: number; newCostUsd: number }) => {
      const { error } = await supabase
        .from("treatment_records")
        .update({ actual_cost_syp: newCostSyp, actual_cost_usd: newCostUsd })
        .eq("id", treatmentRecordId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-treatment-records", patientId] });
      queryClient.invalidateQueries({ queryKey: ["patient-balance", patientId] });
      queryClient.invalidateQueries({ queryKey: ["patient-appointments", patientId] });
      setIsEditTreatmentCostDialogOpen(false);
      setEditingTreatmentCostSyp("");
      setEditingTreatmentCostUsd("");
      toast({ title: "نجح", description: "تم تعديل كلفة العلاج بنجاح" });
    },
  });

  const handleScheduleAppointment = (e: React.FormEvent) => {
    e.preventDefault();
    createAppointmentMutation.mutate(newAppointment);
  };

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    createPaymentMutation.mutate(newPayment);
  };

  // Create treatment plan mutation
  const createTreatmentPlanMutation = useMutation({
    mutationFn: async (plan: typeof treatmentPlan) => {
      const { data, error } = await supabase
        .from("treatment_plans")
        .insert([{ 
          ...plan, 
          patient_id: patientId,
          is_executed: false 
        }])
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setIsTreatmentPlanDialogOpen(false);
      setTreatmentPlan({ treatment_id: "", sub_treatment_id: "", tooth_number: "" });
      toast({ title: "نجح", description: "تم إضافة خطة العلاج بنجاح" });
    },
  });

  const handleAddTreatmentPlan = (e: React.FormEvent) => {
    e.preventDefault();
    createTreatmentPlanMutation.mutate(treatmentPlan);
  };

  const handleExportPatientData = () => {
    // Prepare appointments data
    const appointmentsData = appointments?.map(apt => ({
      'التاريخ': format(new Date(apt.scheduled_at), 'dd/MM/yyyy'),
      'الوقت': new Date(apt.scheduled_at).toLocaleTimeString('ar-EG'),
      'الطبيب': apt.doctors?.full_name || '',
      'الحالة': apt.status === 'Completed' ? 'مكتمل' : apt.status === 'Scheduled' ? 'مجدول' : 'ملغي',
      'الملاحظات': apt.notes || '-'
    })) || [];

    // Prepare treatments data
    const treatmentsData = allTreatmentRecords?.map(record => ({
      'التاريخ': format(new Date((record.appointments as any)?.scheduled_at), 'dd/MM/yyyy'),
      'الطبيب': (record.appointments as any)?.doctors?.full_name || '',
      'العلاج': record.treatments?.name || '',
      'الإجراء الفرعي': record.sub_treatments?.name || '',
      'السن': record.tooth_number,
      'التكلفة بالليرة': Math.round(record.actual_cost_syp || 0),
      'التكلفة بالدولار': record.actual_cost_usd || 0,
      'الحالة': record.is_completed ? 'مكتمل' : 'غير مكتمل'
    })) || [];

    // Prepare payments data
    const paymentsData = allPayments?.map(payment => ({
      'التاريخ': format(new Date(payment.paid_at), 'dd/MM/yyyy'),
      'المبلغ': Math.round(payment.amount),
      'العملة': (payment as any).currency === 'USD' ? 'دولار' : 'ليرة سورية',
      'الموعد': format(new Date((payment.appointments as any)?.scheduled_at), 'dd/MM/yyyy'),
      'الطبيب': (payment.appointments as any)?.doctors?.full_name || ''
    })) || [];

    // Calculate totals
    const totalCostSyp = allTreatmentRecords?.reduce((sum, record) => sum + Number(record.actual_cost_syp || 0), 0) || 0;
    const totalCostUsd = allTreatmentRecords?.reduce((sum, record) => sum + Number(record.actual_cost_usd || 0), 0) || 0;
    const totalPaidSyp = allPayments?.filter(p => (p as any).currency === 'SYP' || !(p as any).currency).reduce((sum, payment) => sum + Number(payment.amount), 0) || 0;
    const totalPaidUsd = allPayments?.filter(p => (p as any).currency === 'USD').reduce((sum, payment) => sum + Number(payment.amount), 0) || 0;

    const summaryData = [{
      'إجمالي التكلفة بالليرة': Math.round(totalCostSyp),
      'إجمالي التكلفة بالدولار': totalCostUsd,
      'إجمالي المدفوع بالليرة': Math.round(totalPaidSyp),
      'إجمالي المدفوع بالدولار': totalPaidUsd,
      'الرصيد بالليرة': Math.round(totalCostSyp - totalPaidSyp),
      'الرصيد بالدولار': totalCostUsd - totalPaidUsd,
    }];

    // Create workbook
    const wb = XLSX.utils.book_new();
    
    // Add patient info sheet
    const patientInfo = [{
      'الاسم': patient.full_name,
      'تاريخ الميلاد': format(new Date(patient.date_of_birth), 'dd/MM/yyyy'),
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
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center space-x-4 space-x-reverse">
          <Button variant="outline" onClick={() => navigate("/patients")}>
            <ArrowLeft className="ml-2 h-4 w-4" />
            العودة للمرضى
          </Button>
          <h1 className="text-2xl lg:text-3xl font-bold">{patient.full_name}</h1>
        </div>
        
        {/* Secondary Navigation Menu - Inline */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportPatientData}
          >
            <Download className="ml-2 h-4 w-4" />
            تصدير ملف المريض
          </Button>
          <Button
            variant={activeSection === "all" ? "default" : "outline"}
            onClick={() => setActiveSection("all")}
            size="sm"
          >
            الكل
          </Button>
          <Button
            variant={activeSection === "appointments" ? "default" : "outline"}
            onClick={() => setActiveSection("appointments")}
            size="sm"
          >
            تاريخ المواعيد
          </Button>
          <Button
            variant={activeSection === "treatments" ? "default" : "outline"}
            onClick={() => setActiveSection("treatments")}
            size="sm"
          >
            جميع العلاجات
          </Button>
          <Button
            variant={activeSection === "payments" ? "default" : "outline"}
            onClick={() => setActiveSection("payments")}
            size="sm"
          >
            جميع المدفوعات
          </Button>
        </div>
      </div>

      {/* Patient Info Cards - Always visible */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>معلومات المريض</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <strong>تاريخ الميلاد:</strong> {format(new Date(patient.date_of_birth), 'dd/MM/yyyy')}
            </div>
            <div>
              <strong>الهاتف:</strong> {patient.phone_number}
            </div>
            {patient.contact && (
              <div>
                <strong>جهة الاتصال:</strong> {patient.contact}
              </div>
            )}
            {patient.medical_notes && (
              <div>
                <strong>الملاحظات الطبية:</strong> {patient.medical_notes}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>الرصيد</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div>
                <div className={`text-xl font-bold ${balance?.syp && balance.syp > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {Math.round(Math.abs(balance?.syp || 0)).toLocaleString('en-US')} ل.س
                </div>
                <p className="text-xs text-muted-foreground">{balance?.syp && balance.syp > 0 ? 'مستحق بالليرة' : 'رصيد زائد بالليرة'}</p>
              </div>
              <div>
                <div className={`text-xl font-bold ${balance?.usd && balance.usd > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  ${Math.round(Math.abs(balance?.usd || 0)).toLocaleString('en-US')}
                </div>
                <p className="text-xs text-muted-foreground">{balance?.usd && balance.usd > 0 ? 'مستحق بالدولار' : 'رصيد زائد بالدولار'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>إجراءات سريعة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Dialog open={isAppointmentDialogOpen} onOpenChange={setIsAppointmentDialogOpen}>
              <DialogTrigger asChild>
                <Button className="w-full">
                  <Calendar className="ml-2 h-4 w-4" />
                  جدولة موعد
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>جدولة موعد جديد</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleScheduleAppointment} className="space-y-4">
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
                  
                  {/* Display future appointments for this patient */}
                  {patientFutureAppointments && patientFutureAppointments.length > 0 && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
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
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                              apt.status === "Scheduled" ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" :
                              apt.status === "Completed" ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" :
                              "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                            }`}>
                              {apt.status === "Scheduled" ? "مجدول" : apt.status === "Completed" ? "مكتمل" : "ملغي"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  <Button type="submit" disabled={createAppointmentMutation.isPending}>
                    {createAppointmentMutation.isPending ? "جاري الجدولة..." : "جدولة"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={isTreatmentPlanDialogOpen} onOpenChange={setIsTreatmentPlanDialogOpen}>
              <DialogTrigger asChild>
                <Button className="w-full" variant="outline">
                  <FileText className="ml-2 h-4 w-4" />
                  إضافة خطة علاج
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>إضافة خطة علاج</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddTreatmentPlan} className="space-y-4">
                  <div>
                    <Label htmlFor="treatment_id">العلاج</Label>
                    <Select value={treatmentPlan.treatment_id} onValueChange={(value) => setTreatmentPlan({ ...treatmentPlan, treatment_id: value, sub_treatment_id: "" })}>
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
                      value={treatmentPlan.sub_treatment_id} 
                      onValueChange={(value) => setTreatmentPlan({ ...treatmentPlan, sub_treatment_id: value })}
                      disabled={!treatmentPlan.treatment_id}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر علاج فرعي" />
                      </SelectTrigger>
                      <SelectContent>
                        {subTreatments?.map((subTreatment) => (
                          <SelectItem key={subTreatment.id} value={subTreatment.id}>
                            {subTreatment.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Tooth Selection Section */}
                {(() => {
                  const selectedSubTreatment = subTreatments?.find(st => st.id === treatmentPlan.sub_treatment_id);
                  const toothAssociation = selectedSubTreatment?.tooth_association || "not_related";
                  const isToothSelectionEnabled = toothAssociation !== "not_related";
                  const isSingleToothOnly = toothAssociation === "single_tooth";

                  return (
                    <div>
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
                            <RadioGroup 
                              value={planTeethType} 
                              onValueChange={(value: "adult" | "child") => {
                                setPlanTeethType(value);
                                setTreatmentPlan({ ...treatmentPlan, tooth_number: "" });
                              }} 
                              className="flex gap-4 justify-center"
                            >
                              <div className="flex items-center space-x-2 space-x-reverse">
                                <RadioGroupItem value="adult" id="plan-adult" />
                                <Label htmlFor="plan-adult" className="cursor-pointer">أسنان البالغين</Label>
                              </div>
                              <div className="flex items-center space-x-2 space-x-reverse">
                                <RadioGroupItem value="child" id="plan-child" />
                                <Label htmlFor="plan-child" className="cursor-pointer">أسنان الأطفال</Label>
                              </div>
                            </RadioGroup>
                          </div>

                          {planTeethType === "adult" ? (
                            <>
                              {/* أسنان البالغين */}
                              <div className="mb-3">
                                <div className="text-xs text-center text-muted-foreground mb-1">الفك العلوي</div>
                                <div className="grid grid-cols-8 gap-1 mb-1">
                                  {[18, 17, 16, 15, 14, 13, 12, 11].map((toothNum) => (
                                    <button
                                      key={toothNum}
                                      type="button"
                                      onClick={() => {
                                        const toothStr = toothNum.toString();
                                        if (isSingleToothOnly) {
                                          setTreatmentPlan({ ...treatmentPlan, tooth_number: toothStr });
                                        } else {
                                          const currentTeeth = treatmentPlan.tooth_number.split(", ").filter(t => t);
                                          const newTeeth = currentTeeth.includes(toothStr)
                                            ? currentTeeth.filter(t => t !== toothStr)
                                            : [...currentTeeth, toothStr];
                                          setTreatmentPlan({ ...treatmentPlan, tooth_number: newTeeth.join(", ") });
                                        }
                                      }}
                                      className={`h-6 w-6 text-xs font-medium border rounded transition-colors ${
                                        treatmentPlan.tooth_number.split(", ").includes(toothNum.toString())
                                          ? 'bg-primary text-primary-foreground border-primary'
                                          : 'bg-background hover:bg-muted border-border'
                                      }`}
                                    >
                                      {toothNum}
                                    </button>
                                  ))}
                                </div>
                                <div className="grid grid-cols-8 gap-1">
                                  {[21, 22, 23, 24, 25, 26, 27, 28].map((toothNum) => (
                                    <button
                                      key={toothNum}
                                      type="button"
                                      onClick={() => {
                                        const toothStr = toothNum.toString();
                                        if (isSingleToothOnly) {
                                          setTreatmentPlan({ ...treatmentPlan, tooth_number: toothStr });
                                        } else {
                                          const currentTeeth = treatmentPlan.tooth_number.split(", ").filter(t => t);
                                          const newTeeth = currentTeeth.includes(toothStr)
                                            ? currentTeeth.filter(t => t !== toothStr)
                                            : [...currentTeeth, toothStr];
                                          setTreatmentPlan({ ...treatmentPlan, tooth_number: newTeeth.join(", ") });
                                        }
                                      }}
                                      className={`h-6 w-6 text-xs font-medium border rounded transition-colors ${
                                        treatmentPlan.tooth_number.split(", ").includes(toothNum.toString())
                                          ? 'bg-primary text-primary-foreground border-primary'
                                          : 'bg-background hover:bg-muted border-border'
                                      }`}
                                    >
                                      {toothNum}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div>
                                <div className="text-xs text-center text-muted-foreground mb-1">الفك السفلي</div>
                                <div className="grid grid-cols-8 gap-1 mb-1">
                                  {[31, 32, 33, 34, 35, 36, 37, 38].map((toothNum) => (
                                    <button
                                      key={toothNum}
                                      type="button"
                                      onClick={() => {
                                        const toothStr = toothNum.toString();
                                        if (isSingleToothOnly) {
                                          setTreatmentPlan({ ...treatmentPlan, tooth_number: toothStr });
                                        } else {
                                          const currentTeeth = treatmentPlan.tooth_number.split(", ").filter(t => t);
                                          const newTeeth = currentTeeth.includes(toothStr)
                                            ? currentTeeth.filter(t => t !== toothStr)
                                            : [...currentTeeth, toothStr];
                                          setTreatmentPlan({ ...treatmentPlan, tooth_number: newTeeth.join(", ") });
                                        }
                                      }}
                                      className={`h-6 w-6 text-xs font-medium border rounded transition-colors ${
                                        treatmentPlan.tooth_number.split(", ").includes(toothNum.toString())
                                          ? 'bg-primary text-primary-foreground border-primary'
                                          : 'bg-background hover:bg-muted border-border'
                                      }`}
                                    >
                                      {toothNum}
                                    </button>
                                  ))}
                                </div>
                                <div className="grid grid-cols-8 gap-1">
                                  {[41, 42, 43, 44, 45, 46, 47, 48].map((toothNum) => (
                                    <button
                                      key={toothNum}
                                      type="button"
                                      onClick={() => {
                                        const toothStr = toothNum.toString();
                                        if (isSingleToothOnly) {
                                          setTreatmentPlan({ ...treatmentPlan, tooth_number: toothStr });
                                        } else {
                                          const currentTeeth = treatmentPlan.tooth_number.split(", ").filter(t => t);
                                          const newTeeth = currentTeeth.includes(toothStr)
                                            ? currentTeeth.filter(t => t !== toothStr)
                                            : [...currentTeeth, toothStr];
                                          setTreatmentPlan({ ...treatmentPlan, tooth_number: newTeeth.join(", ") });
                                        }
                                      }}
                                      className={`h-6 w-6 text-xs font-medium border rounded transition-colors ${
                                        treatmentPlan.tooth_number.split(", ").includes(toothNum.toString())
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
                              <div className="mb-3">
                                <div className="text-xs text-center text-muted-foreground mb-1">الفك العلوي</div>
                                <div className="grid grid-cols-5 gap-1 mb-1">
                                  {[55, 54, 53, 52, 51].map((toothNum) => (
                                    <button
                                      key={toothNum}
                                      type="button"
                                      onClick={() => {
                                        const toothStr = toothNum.toString();
                                        if (isSingleToothOnly) {
                                          setTreatmentPlan({ ...treatmentPlan, tooth_number: toothStr });
                                        } else {
                                          const currentTeeth = treatmentPlan.tooth_number.split(", ").filter(t => t);
                                          const newTeeth = currentTeeth.includes(toothStr)
                                            ? currentTeeth.filter(t => t !== toothStr)
                                            : [...currentTeeth, toothStr];
                                          setTreatmentPlan({ ...treatmentPlan, tooth_number: newTeeth.join(", ") });
                                        }
                                      }}
                                      className={`h-6 w-6 text-xs font-medium border rounded transition-colors ${
                                        treatmentPlan.tooth_number.split(", ").includes(toothNum.toString())
                                          ? 'bg-primary text-primary-foreground border-primary'
                                          : 'bg-background hover:bg-muted border-border'
                                      }`}
                                    >
                                      {toothNum}
                                    </button>
                                  ))}
                                </div>
                                <div className="grid grid-cols-5 gap-1">
                                  {[61, 62, 63, 64, 65].map((toothNum) => (
                                    <button
                                      key={toothNum}
                                      type="button"
                                      onClick={() => {
                                        const toothStr = toothNum.toString();
                                        if (isSingleToothOnly) {
                                          setTreatmentPlan({ ...treatmentPlan, tooth_number: toothStr });
                                        } else {
                                          const currentTeeth = treatmentPlan.tooth_number.split(", ").filter(t => t);
                                          const newTeeth = currentTeeth.includes(toothStr)
                                            ? currentTeeth.filter(t => t !== toothStr)
                                            : [...currentTeeth, toothStr];
                                          setTreatmentPlan({ ...treatmentPlan, tooth_number: newTeeth.join(", ") });
                                        }
                                      }}
                                      className={`h-6 w-6 text-xs font-medium border rounded transition-colors ${
                                        treatmentPlan.tooth_number.split(", ").includes(toothNum.toString())
                                          ? 'bg-primary text-primary-foreground border-primary'
                                          : 'bg-background hover:bg-muted border-border'
                                      }`}
                                    >
                                      {toothNum}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div>
                                <div className="text-xs text-center text-muted-foreground mb-1">الفك السفلي</div>
                                <div className="grid grid-cols-5 gap-1 mb-1">
                                  {[71, 72, 73, 74, 75].map((toothNum) => (
                                    <button
                                      key={toothNum}
                                      type="button"
                                      onClick={() => {
                                        const toothStr = toothNum.toString();
                                        if (isSingleToothOnly) {
                                          setTreatmentPlan({ ...treatmentPlan, tooth_number: toothStr });
                                        } else {
                                          const currentTeeth = treatmentPlan.tooth_number.split(", ").filter(t => t);
                                          const newTeeth = currentTeeth.includes(toothStr)
                                            ? currentTeeth.filter(t => t !== toothStr)
                                            : [...currentTeeth, toothStr];
                                          setTreatmentPlan({ ...treatmentPlan, tooth_number: newTeeth.join(", ") });
                                        }
                                      }}
                                      className={`h-6 w-6 text-xs font-medium border rounded transition-colors ${
                                        treatmentPlan.tooth_number.split(", ").includes(toothNum.toString())
                                          ? 'bg-primary text-primary-foreground border-primary'
                                          : 'bg-background hover:bg-muted border-border'
                                      }`}
                                    >
                                      {toothNum}
                                    </button>
                                  ))}
                                </div>
                                <div className="grid grid-cols-5 gap-1">
                                  {[81, 82, 83, 84, 85].map((toothNum) => (
                                    <button
                                      key={toothNum}
                                      type="button"
                                      onClick={() => {
                                        const toothStr = toothNum.toString();
                                        if (isSingleToothOnly) {
                                          setTreatmentPlan({ ...treatmentPlan, tooth_number: toothStr });
                                        } else {
                                          const currentTeeth = treatmentPlan.tooth_number.split(", ").filter(t => t);
                                          const newTeeth = currentTeeth.includes(toothStr)
                                            ? currentTeeth.filter(t => t !== toothStr)
                                            : [...currentTeeth, toothStr];
                                          setTreatmentPlan({ ...treatmentPlan, tooth_number: newTeeth.join(", ") });
                                        }
                                      }}
                                      className={`h-6 w-6 text-xs font-medium border rounded transition-colors ${
                                        treatmentPlan.tooth_number.split(", ").includes(toothNum.toString())
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

                          {treatmentPlan.tooth_number && (
                            <div className="mt-3 p-2 bg-primary/10 rounded text-center">
                              <span className="text-sm font-medium">الأسنان المختارة: </span>
                              <span className="text-sm text-primary">{treatmentPlan.tooth_number}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                <Button type="submit" disabled={createTreatmentPlanMutation.isPending}>
                  {createTreatmentPlanMutation.isPending ? "جاري الإضافة..." : "إضافة"}
                </Button>
              </form>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>

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
                {unfinishedSubTreatments.map((item:any) => (
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
                    <TableCell>{appointment.doctors?.full_name}</TableCell>
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
                          {record.treatments?.name} - {record.sub_treatments?.name} (السن {record.tooth_number})
                        </div>
                      ))}
                    </TableCell>
                    <TableCell>
                      {appointment.payments?.map((payment, index) => (
                        <div key={index} className="text-sm">
                          {Math.round(payment.amount).toLocaleString('en-US')} on {format(new Date(payment.paid_at), 'dd/MM/yyyy')}
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
      )}

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

      {/* All Treatment Records Section */}
      {(activeSection === "all" || activeSection === "treatments") && (
        <Card>
          <CardHeader>
            <CardTitle>جميع العلاجات</CardTitle>
          </CardHeader>
          <CardContent>
            {allTreatmentRecords && allTreatmentRecords.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">العلاج الفرعي</TableHead>
                    <TableHead className="text-right">رقم السن</TableHead>
                    <TableHead className="text-right">الخطوات المنفذة</TableHead>
                    <TableHead className="text-right">التكلفة</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">الطبيب</TableHead>
                    <TableHead className="text-right">ملاحظة العلاج</TableHead>
                    <TableHead className="text-right">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allTreatmentRecords.map((record: any) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        {format(new Date(record.appointments?.scheduled_at), 'dd/MM/yyyy')}
                      </TableCell>
                      <TableCell>{record.sub_treatments?.name}</TableCell>
                      <TableCell>{record.tooth_number}</TableCell>
                      <TableCell>
                        {record.executed_steps && record.executed_steps.length > 0 ? (
                          <div className="text-sm space-y-1">
                            {record.executed_steps.map((step: any, idx: number) => (
                              <div key={idx} className="flex items-center gap-1">
                                <span className="text-green-600">✓</span>
                                <span>{step.sub_treatment_steps?.step_name || '-'}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>{Math.round(record.actual_cost || 0).toLocaleString('en-US')}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded text-xs ${
                          record.is_completed 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-orange-100 text-orange-800'
                        }`}>
                          {record.is_completed ? 'مكتمل' : 'غير مكتمل'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {record.appointments?.doctors?.full_name || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-muted-foreground max-w-xs truncate" title={record.treatment_notes || '-'}>
                          {record.treatment_notes || '-'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {!record.is_completed && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => markCompleteMutation.mutate(record.id)}
                              disabled={markCompleteMutation.isPending}
                            >
                              تمييز كمكتمل
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedTreatmentRecord(record);
                              setEditingTreatmentCostSyp(record.actual_cost_syp?.toString() || "");
                              setEditingTreatmentCostUsd(record.actual_cost_usd?.toString() || "");
                              setIsEditTreatmentCostDialogOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4 ml-1" />
                            تعديل كلفة
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              setTreatmentToDelete(record.id);
                              setIsDeleteTreatmentDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>لا توجد علاجات مسجلة لهذا المريض</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Edit Treatment Cost Dialog */}
      <Dialog open={isEditTreatmentCostDialogOpen} onOpenChange={setIsEditTreatmentCostDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل كلفة العلاج</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedTreatmentRecord && (
              <>
                <div className="space-y-2">
                  <div className="text-sm">
                    <span className="font-semibold">العلاج الفرعي:</span> {selectedTreatmentRecord.sub_treatments?.name}
                  </div>
                  <div className="text-sm">
                    <span className="font-semibold">رقم السن:</span> {selectedTreatmentRecord.tooth_number}
                  </div>
                  <div className="text-sm">
                    <span className="font-semibold">التاريخ:</span> {format(new Date(selectedTreatmentRecord.appointments?.scheduled_at), 'dd/MM/yyyy')}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>الكلفة الحالية</Label>
                  <div className="font-semibold text-lg">
                    {Math.round(selectedTreatmentRecord.actual_cost || 0).toLocaleString('en-US')}
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="new-cost-syp">الكلفة بالليرة السورية</Label>
                    <Input
                      id="new-cost-syp"
                      type="text"
                      placeholder="أدخل الكلفة بالليرة"
                      value={editingTreatmentCostSyp}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^\d]/g, '');
                        setEditingTreatmentCostSyp(value);
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-cost-usd">الكلفة بالدولار</Label>
                    <Input
                      id="new-cost-usd"
                      type="text"
                      placeholder="أدخل الكلفة بالدولار"
                      value={editingTreatmentCostUsd}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^\d.]/g, '');
                        setEditingTreatmentCostUsd(value);
                      }}
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setIsEditTreatmentCostDialogOpen(false)}
                  >
                    إلغاء
                  </Button>
                  <Button
                    disabled={updateTreatmentCostMutation.isPending}
                    onClick={() => {
                      updateTreatmentCostMutation.mutate({
                        treatmentRecordId: selectedTreatmentRecord.id,
                        newCostSyp: parseFloat(editingTreatmentCostSyp) || 0,
                        newCostUsd: parseFloat(editingTreatmentCostUsd) || 0
                      });
                    }}
                  >
                    {updateTreatmentCostMutation.isPending ? "جاري الحفظ..." : "حفظ"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Treatment Confirmation Dialog */}
      <AlertDialog open={isDeleteTreatmentDialogOpen} onOpenChange={setIsDeleteTreatmentDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف هذا العلاج؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (treatmentToDelete) {
                  deleteTreatmentMutation.mutate(treatmentToDelete);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* All Payments Section */}
      {(activeSection === "all" || activeSection === "payments") && (
        <Card>
          <CardHeader>
            <CardTitle>جميع المدفوعات</CardTitle>
          </CardHeader>
          <CardContent>
            {allPayments && allPayments.length > 0 ? (
              <>
                <div className="mb-4 p-4 bg-muted/50 rounded-lg">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-green-600">
                        {Math.round(allPayments.filter(p => p.currency === 'SYP' || !p.currency).reduce((sum, payment) => sum + Number(payment.amount), 0)).toLocaleString('en-US')} ل.س
                      </div>
                      <p className="text-sm text-muted-foreground">إجمالي المدفوعات بالليرة</p>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-green-600">
                        ${Math.round(allPayments.filter(p => p.currency === 'USD').reduce((sum, payment) => sum + Number(payment.amount), 0)).toLocaleString('en-US')}
                      </div>
                      <p className="text-sm text-muted-foreground">إجمالي المدفوعات بالدولار</p>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-blue-600">
                        {Math.round(allTreatmentRecords?.reduce((sum, record) => sum + Number(record.actual_cost_syp || 0), 0) || 0).toLocaleString('en-US')} ل.س
                      </div>
                      <p className="text-sm text-muted-foreground">إجمالي تكلفة العلاجات بالليرة</p>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-blue-600">
                        ${Math.round(allTreatmentRecords?.reduce((sum, record) => sum + Number(record.actual_cost_usd || 0), 0) || 0).toLocaleString('en-US')}
                      </div>
                      <p className="text-sm text-muted-foreground">إجمالي تكلفة العلاجات بالدولار</p>
                    </div>
                    <div>
                      <div className={`text-2xl font-bold ${balance?.syp && balance.syp > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {Math.round(Math.abs(balance?.syp || 0)).toLocaleString('en-US')} ل.س
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {balance?.syp && balance.syp > 0 ? 'المبلغ المستحق بالليرة' : 'رصيد زائد بالليرة'}
                      </p>
                    </div>
                    <div>
                      <div className={`text-2xl font-bold ${balance?.usd && balance.usd > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        ${Math.round(Math.abs(balance?.usd || 0)).toLocaleString('en-US')}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {balance?.usd && balance.usd > 0 ? 'المبلغ المستحق بالدولار' : 'رصيد زائد بالدولار'}
                      </p>
                    </div>
                  </div>
                </div>
                
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">تاريخ الدفع</TableHead>
                      <TableHead className="text-right">المبلغ</TableHead>
                      <TableHead className="text-right">العملة</TableHead>
                      <TableHead className="text-right">تاريخ الموعد</TableHead>
                      <TableHead className="text-right">الطبيب</TableHead>
                      <TableHead className="text-right">ملاحظات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allPayments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>
                          {format(new Date(payment.paid_at), 'dd/MM/yyyy')}
                        </TableCell>
                        <TableCell className="font-semibold text-green-600">
                          {payment.currency === 'USD' ? '$' : ''}{Math.round(payment.amount).toLocaleString('en-US')}{payment.currency !== 'USD' ? ' ل.س' : ''}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${payment.currency === 'USD' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                            {payment.currency === 'USD' ? 'دولار' : 'ليرة سورية'}
                          </span>
                        </TableCell>
                        <TableCell>
                          {format(new Date(payment.appointments?.scheduled_at), 'dd/MM/yyyy')}
                        </TableCell>
                        <TableCell>
                          {payment.appointments?.doctors?.full_name || '-'}
                        </TableCell>
                        <TableCell>
                          {(payment as any).notes || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <CreditCard className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <p>لا توجد مدفوعات مسجلة لهذا المريض</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}