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
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
  const [selectedSteps, setSelectedSteps] = useState<string[]>([]);
  
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
      const { data, error } = await supabase
        .from("treatment_records")
        .insert([{ 
          ...record, 
          appointment_id: selectedAppointment.id,
          actual_cost: record.actual_cost ? parseFloat(record.actual_cost) : null
        }])
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      setIsRecordDialogOpen(false);
      setTreatmentRecord({ treatment_id: "", sub_treatment_id: "", tooth_number: "", actual_cost: "" });
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
                      <span className={`px-2 py-1 rounded text-xs ${
                        appointment.status === 'Completed' ? 'bg-green-100 text-green-800' :
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
                                 setIsStepsDialogOpen(true);
                               }}
                             >
                               <CheckSquare className="h-4 w-4 ml-1" />
                               خطوات العلاج
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تسجيل علاج</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRecordTreatment} className="space-y-4">
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
                      {treatment.name} - ${treatment.estimated_cost}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {treatmentRecord.treatment_id && (
                <div className="mt-2 p-2 bg-blue-50 rounded text-sm">
                  <span className="font-medium">التكلفة المقدرة: </span>
                  ${treatments?.find(t => t.id === treatmentRecord.treatment_id)?.estimated_cost}
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="sub_treatment_id">العلاج الفرعي</Label>
              <Select 
                value={treatmentRecord.sub_treatment_id} 
                onValueChange={(value) => setTreatmentRecord({ ...treatmentRecord, sub_treatment_id: value })}
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
            <div>
              <Label htmlFor="tooth_number">رقم السن</Label>
              <Input
                id="tooth_number"
                value={treatmentRecord.tooth_number}
                onChange={(e) => setTreatmentRecord({ ...treatmentRecord, tooth_number: e.target.value })}
                placeholder="مثال: 14، 23، إلخ"
                required
              />
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
            <Button type="submit" disabled={recordTreatmentMutation.isPending}>
              {recordTreatmentMutation.isPending ? "جاري التسجيل..." : "تسجيل العلاج"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isStepsDialogOpen} onOpenChange={setIsStepsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>تسجيل خطوات العلاج</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            saveStepsMutation.mutate(selectedSteps);
          }} className="space-y-4">
            <div>
              <Label htmlFor="treatment_selection">العلاج</Label>
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
            
            {treatmentRecord.treatment_id && (
              <div>
                <Label htmlFor="sub_treatment_selection">العلاج الفرعي</Label>
                <Select 
                  value={treatmentRecord.sub_treatment_id} 
                  onValueChange={(value) => setTreatmentRecord({ ...treatmentRecord, sub_treatment_id: value })}
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
            )}

            {treatmentRecord.sub_treatment_id && treatmentSteps && treatmentSteps.length > 0 && (
              <div className="space-y-3">
                <Label>خطوات العلاج</Label>
                <div className="max-h-60 overflow-y-auto space-y-2 border rounded p-3">
                  {treatmentSteps.map((step) => {
                    const isCompleted = completedSteps?.some(cs => cs.sub_treatment_step_id === step.id);
                    const isSelected = selectedSteps.includes(step.id);
                    
                    return (
                      <div key={step.id} className="flex items-start space-x-3 p-2 border rounded">
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
                        />
                        <div className="flex-1">
                          <label htmlFor={step.id} className="text-sm font-medium cursor-pointer">
                            {step.step_order}. {step.step_name}
                          </label>
                          {step.step_description && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {step.step_description}
                            </p>
                          )}
                          {isCompleted && (
                            <span className="text-xs text-green-600 font-medium">
                              ✓ تم تنفيذها سابقاً
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="text-sm text-muted-foreground">
                  تم اختيار {selectedSteps.length} خطوة من أصل {treatmentSteps.length}
                </div>
              </div>
            )}

            {treatmentRecord.sub_treatment_id && (!treatmentSteps || treatmentSteps.length === 0) && (
              <div className="text-center py-4 text-muted-foreground">
                لا توجد خطوات محددة لهذا العلاج الفرعي
              </div>
            )}

            <Button 
              type="submit" 
              disabled={saveStepsMutation.isPending || !treatmentRecord.sub_treatment_id}
            >
              {saveStepsMutation.isPending ? "جاري الحفظ..." : "حفظ الخطوات المنجزة"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}