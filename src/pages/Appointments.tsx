import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Plus, FileText, Filter, X, MessageCircle, CheckSquare } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

export default function Appointments() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isRecordDialogOpen, setIsRecordDialogOpen] = useState(false);
  const [isStepsDialogOpen, setIsStepsDialogOpen] = useState(false);
  const [isResumeDialogOpen, setIsResumeDialogOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
  const [selectedSteps, setSelectedSteps] = useState<string[]>([]);
  const [selectedTreatmentRecord, setSelectedTreatmentRecord] = useState<any>(null);

  // Filter states
  const [filterDoctor, setFilterDoctor] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const [newAppointment, setNewAppointment] = useState({
    patient_id: "",
    doctor_id: "",
    scheduled_at: "",
    notes: "",
  });

  const [treatmentRecord, setTreatmentRecord] = useState({
    treatment_id: "",
    sub_treatment_id: "",
    tooth_number: "",
    actual_cost: "",
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: appointments, isLoading } = useQuery({
    queryKey: ["appointments", filterDoctor, filterDate, filterStatus],
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

      // Apply date filter
      if (filterDate) {
        const startOfDay = new Date(filterDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(filterDate);
        endOfDay.setHours(23, 59, 59, 999);

        query = query
          .gte("scheduled_at", startOfDay.toISOString())
          .lte("scheduled_at", endOfDay.toISOString());
      }

      // Apply status filter
      if (filterStatus && filterStatus !== "all") {
        query = query.eq("status", filterStatus as "Scheduled" | "Completed" | "Cancelled");
      }

      const { data, error } = await query.order("scheduled_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: patients } = useQuery({
    queryKey: ["patients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("patients").select("id, full_name");
      if (error) throw error;
      return data;
    },
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
        !record.is_completed
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
      const { data, error } = await supabase.from("appointments").insert([appointment]).select();
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

  const recordTreatmentMutation = useMutation({
    mutationFn: async (record: typeof treatmentRecord) => {
      // Insert treatment record
      const { data, error } = await supabase
        .from("treatment_records")
        .insert([{
          ...record,
          appointment_id: selectedAppointment.id,
          actual_cost: record.actual_cost ? parseFloat(record.actual_cost) : null
        }])
        .select();
      if (error) throw error;

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

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["completed-steps"] });
      setIsRecordDialogOpen(false);
      setTreatmentRecord({ treatment_id: "", sub_treatment_id: "", tooth_number: "", actual_cost: "" });
      setSelectedSteps([]);
      toast({ title: "Success", description: "Treatment recorded successfully" });
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

      // Check if all steps are completed and mark treatment as completed
      const allSteps = resumeTreatmentSteps || [];
      const allCompletedSteps = [...(resumeCompletedSteps || []), ...stepData];
      const completedStepIds = allCompletedSteps.map(cs => cs.sub_treatment_step_id);
      const allStepsCompleted = allSteps.every(step => completedStepIds.includes(step.id));

      if (allStepsCompleted) {
        await supabase
          .from("treatment_records")
          .update({ is_completed: true })
          .eq("id", selectedTreatmentRecord.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unfinished-treatments"] });
      queryClient.invalidateQueries({ queryKey: ["resume-completed-steps"] });
      setIsResumeDialogOpen(false);
      setSelectedSteps([]);
      setSelectedTreatmentRecord(null);
      toast({ title: "نجح", description: "تم استكمال خطوات العلاج بنجاح" });
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
    createAppointmentMutation.mutate(newAppointment);
  };

  const handleRecordTreatment = (e: React.FormEvent) => {
    e.preventDefault();
    recordTreatmentMutation.mutate(treatmentRecord);
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
    const formattedDate = appointmentDate.toLocaleDateString('ar-SA');
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">المواعيد</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="ml-2 h-4 w-4" />
              موعد جديد
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>إنشاء موعد جديد</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="patient_id">المريض</Label>
                <Select value={newAppointment.patient_id} onValueChange={(value) => setNewAppointment({ ...newAppointment, patient_id: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر مريض" />
                  </SelectTrigger>
                  <SelectContent>
                    {patients?.map((patient) => (
                      <SelectItem key={patient.id} value={patient.id}>
                        {patient.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              <Button type="submit" disabled={createAppointmentMutation.isPending}>
                {createAppointmentMutation.isPending ? "جاري الإنشاء..." : "إنشاء موعد"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>قائمة المواعيد</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div>جاري تحميل المواعيد...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <div className="space-y-2">
                      <span>التاريخ والوقت</span>
                      <Input
                        type="date"
                        value={filterDate}
                        onChange={(e) => setFilterDate(e.target.value)}
                        placeholder="فلترة بالتاريخ"
                        className="text-xs"
                      />
                    </div>
                  </TableHead>
                  <TableHead>المريض</TableHead>
                  <TableHead>
                    <div className="space-y-2">
                      <span>الطبيب</span>
                      <Select value={filterDoctor} onValueChange={setFilterDoctor}>
                        <SelectTrigger className="text-xs">
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
                  </TableHead>
                  <TableHead>
                    <div className="space-y-2">
                      <span>الحالة</span>
                      <Select value={filterStatus} onValueChange={setFilterStatus}>
                        <SelectTrigger className="text-xs">
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
                  </TableHead>
                  <TableHead>ملاحظات</TableHead>
                  <TableHead>الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appointments?.map((appointment) => (
                  <TableRow key={appointment.id}>
                    <TableCell>
                      {new Date(appointment.scheduled_at).toLocaleString()}
                    </TableCell>
                    <TableCell>{appointment.patients?.full_name}</TableCell>
                    <TableCell>
                      {appointment.doctors?.full_name}
                      <br />
                      <span className="text-sm text-muted-foreground">
                        {appointment.doctors?.specialty}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded text-xs ${appointment.status === 'Completed' ? 'bg-green-100 text-green-800' :
                        appointment.status === 'Scheduled' ? 'bg-blue-100 text-blue-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                        {appointment.status === 'Completed' ? 'مكتمل' :
                          appointment.status === 'Scheduled' ? 'مجدول' : 'ملغي'}
                      </span>
                    </TableCell>
                    <TableCell>{appointment.notes || "-"}</TableCell>
                    <TableCell>
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
                              <FileText className="h-4 w-4 ml-1" />
                              تسجيل علاج
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
                              <CheckSquare className="h-4 w-4 ml-1" />
                              استكمال علاج
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => updateAppointmentStatus(appointment.id, 'Completed')}
                            >
                              تمييز كمكتمل
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
                          واتساب
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/patient-profile/${appointment.patient_id}`)}
                        >
                          عرض المريض
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
                      actual_cost: selectedSubTreatment?.estimated_cost?.toString() || ""
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر علاج فرعي" />
                  </SelectTrigger>
                  <SelectContent>
                    {subTreatments?.map((subTreatment) => (
                      <SelectItem key={subTreatment.id} value={subTreatment.id}>
                        {subTreatment.name} - ${subTreatment.estimated_cost}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <Label>رقم السن</Label>
                <div className="border rounded-lg p-3 bg-muted/30">
                  <div className="text-center text-xs font-medium mb-2">مخطط الأسنان - النظام العالمي</div>

                  {/* الفك العلوي */}
                  <div className="mb-3">
                    <div className="text-xs text-center text-muted-foreground mb-1">الفك العلوي</div>
                    {/* الصف الأول: 18-11 */}
                    <div className="grid grid-cols-8 gap-1 mb-1">
                      {[18, 17, 16, 15, 14, 13, 12, 11].map((toothNum) => (
                        <button
                          key={toothNum}
                          type="button"
                          onClick={() => setTreatmentRecord({ ...treatmentRecord, tooth_number: toothNum.toString() })}
                          className={`h-6 w-6 text-xs font-medium border rounded transition-colors ${treatmentRecord.tooth_number === toothNum.toString()
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background hover:bg-muted border-border'
                            }`}
                        >
                          {toothNum}
                        </button>
                      ))}
                    </div>
                    {/* الصف الثاني: 21-28 */}
                    <div className="grid grid-cols-8 gap-1">
                      {[21, 22, 23, 24, 25, 26, 27, 28].map((toothNum) => (
                        <button
                          key={toothNum}
                          type="button"
                          onClick={() => setTreatmentRecord({ ...treatmentRecord, tooth_number: toothNum.toString() })}
                          className={`h-6 w-6 text-xs font-medium border rounded transition-colors ${treatmentRecord.tooth_number === toothNum.toString()
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background hover:bg-muted border-border'
                            }`}
                        >
                          {toothNum}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* الفك السفلي */}
                  <div>
                    <div className="text-xs text-center text-muted-foreground mb-1">الفك السفلي</div>
                    {/* الصف الثالث: 31-38 */}
                    <div className="grid grid-cols-8 gap-1 mb-1">
                      {[31, 32, 33, 34, 35, 36, 37, 38].map((toothNum) => (
                        <button
                          key={toothNum}
                          type="button"
                          onClick={() => setTreatmentRecord({ ...treatmentRecord, tooth_number: toothNum.toString() })}
                          className={`h-6 w-6 text-xs font-medium border rounded transition-colors ${treatmentRecord.tooth_number === toothNum.toString()
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background hover:bg-muted border-border'
                            }`}
                        >
                          {toothNum}
                        </button>
                      ))}
                    </div>
                    {/* الصف الرابع: 48-41 */}
                    <div className="grid grid-cols-8 gap-1">
                      {[48, 47, 46, 45, 44, 43, 42, 41].map((toothNum) => (
                        <button
                          key={toothNum}
                          type="button"
                          onClick={() => setTreatmentRecord({ ...treatmentRecord, tooth_number: toothNum.toString() })}
                          className={`h-6 w-6 text-xs font-medium border rounded transition-colors ${treatmentRecord.tooth_number === toothNum.toString()
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background hover:bg-muted border-border'
                            }`}
                        >
                          {toothNum}
                        </button>
                      ))}
                    </div>
                  </div>

                  {treatmentRecord.tooth_number && (
                    <div className="mt-2 text-center text-xs text-primary">
                      السن المحدد: {treatmentRecord.tooth_number}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <Label htmlFor="actual_cost">التكلفة الحقيقية</Label>
                <Input
                  id="actual_cost"
                  type="number"
                  step="0.01"
                  value={treatmentRecord.actual_cost}
                  onChange={(e) => setTreatmentRecord({ ...treatmentRecord, actual_cost: e.target.value })}
                  placeholder="أدخل التكلفة الحقيقية"
                  required
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
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>استكمال علاج - {selectedAppointment?.patients?.full_name}</DialogTitle>
          </DialogHeader>

          {console.log("Unfinished treatments:", unfinishedTreatments, "Error:", unfinishedError)}
          {unfinishedTreatments && unfinishedTreatments.length > 0 ? (
            <div className="space-y-4">
              <div>
                <Label className="text-base font-semibold">اختر العلاج المراد استكماله</Label>
                <div className="grid gap-3 mt-2">
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
                              السن: {treatment.tooth_number} | التكلفة: ${treatment.actual_cost}
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
                <Button
                  onClick={() => resumeStepsMutation.mutate(selectedSteps)}
                  disabled={resumeStepsMutation.isPending || selectedSteps.length === 0}
                  className="w-full"
                >
                  {resumeStepsMutation.isPending ? "جاري الحفظ..." : `حفظ ${selectedSteps.length} خطوات مكتملة`}
                </Button>
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

    </div>
  );
}