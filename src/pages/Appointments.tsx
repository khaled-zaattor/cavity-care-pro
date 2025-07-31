import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, FileText } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

export default function Appointments() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isRecordDialogOpen, setIsRecordDialogOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
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
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: appointments, isLoading } = useQuery({
    queryKey: ["appointments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(`
          *,
          patients (full_name),
          doctors (full_name, specialty)
        `)
        .order("scheduled_at", { ascending: false });
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
        .insert([{ ...record, appointment_id: selectedAppointment.id }])
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      setIsRecordDialogOpen(false);
      setTreatmentRecord({ treatment_id: "", sub_treatment_id: "", tooth_number: "" });
      toast({ title: "Success", description: "Treatment recorded successfully" });
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
                  <TableHead>التاريخ والوقت</TableHead>
                  <TableHead>المريض</TableHead>
                  <TableHead>الطبيب</TableHead>
                  <TableHead>الحالة</TableHead>
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
                              onClick={() => updateAppointmentStatus(appointment.id, 'Completed')}
                            >
                              تمييز كمكتمل
                            </Button>
                          </>
                        )}
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
            </div>
            <div>
              <Label htmlFor="sub_treatment_id">Sub-Treatment</Label>
              <Select 
                value={treatmentRecord.sub_treatment_id} 
                onValueChange={(value) => setTreatmentRecord({ ...treatmentRecord, sub_treatment_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a sub-treatment" />
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
              <Label htmlFor="tooth_number">Tooth Number</Label>
              <Input
                id="tooth_number"
                value={treatmentRecord.tooth_number}
                onChange={(e) => setTreatmentRecord({ ...treatmentRecord, tooth_number: e.target.value })}
                placeholder="e.g., 14, 23, etc."
                required
              />
            </div>
            <Button type="submit" disabled={recordTreatmentMutation.isPending}>
              {recordTreatmentMutation.isPending ? "Recording..." : "Record Treatment"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}