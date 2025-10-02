import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Plus, Calendar, CreditCard, Edit } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function PatientProfile() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isAppointmentDialogOpen, setIsAppointmentDialogOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isEditPaymentDialogOpen, setIsEditPaymentDialogOpen] = useState(false);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState("");
  const [activeSection, setActiveSection] = useState("all"); // "all", "appointments", "treatments", "payments"
  const [editingPayments, setEditingPayments] = useState<{[key: string]: string}>({});

  const [newAppointment, setNewAppointment] = useState({
    doctor_id: "",
    scheduled_at: "",
    notes: "",
  });

  const [newPayment, setNewPayment] = useState({
    amount: "",
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

  // Fetch doctors
  const { data: doctors } = useQuery({
    queryKey: ["doctors"],
    queryFn: async () => {
      const { data, error } = await supabase.from("doctors").select("*");
      if (error) throw error;
      return data;
    },
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
          appointments!inner (patient_id)
        `)
        .eq("appointments.patient_id", patientId);

      if (trError || pError) throw trError || pError;

      const totalCost = treatmentRecords?.reduce((sum, record) => sum + Number((record as any).actual_cost || 0), 0) || 0;
      const totalPaid = payments?.reduce((sum, payment) => sum + Number(payment.amount), 0) || 0;

      return totalCost - totalPaid;
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
            doctors (full_name)
          )
        `)
        .eq("appointments.patient_id", patientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
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
        .insert([{ ...payment, appointment_id: selectedAppointmentId, amount: parseFloat(payment.amount) }])
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-appointments", patientId] });
      queryClient.invalidateQueries({ queryKey: ["patient-balance", patientId] });
      queryClient.invalidateQueries({ queryKey: ["appointment-payments", selectedAppointmentId] });
      setIsPaymentDialogOpen(false);
      setNewPayment({ amount: "" });
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

  const handleScheduleAppointment = (e: React.FormEvent) => {
    e.preventDefault();
    createAppointmentMutation.mutate(newAppointment);
  };

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    createPaymentMutation.mutate(newPayment);
  };

  if (!patient) return <div>جاري تحميل بيانات المريض...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center space-x-4">
          <Button variant="outline" onClick={() => navigate("/patients")}>
            <ArrowLeft className="ml-2 h-4 w-4" />
            العودة للمرضى
          </Button>
          <h1 className="text-2xl lg:text-3xl font-bold">{patient.full_name}</h1>
        </div>
        
        {/* Secondary Navigation Menu - Inline */}
        <div className="flex flex-wrap gap-2">
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
              <strong>تاريخ الميلاد:</strong> {new Date(patient.date_of_birth).toLocaleDateString()}
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
            <div className="text-2xl font-bold">
              ${balance?.toFixed(2) || "0.00"}
            </div>
            <p className="text-muted-foreground">الرصيد المستحق</p>
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
                  <Button type="submit" disabled={createAppointmentMutation.isPending}>
                    {createAppointmentMutation.isPending ? "جاري الجدولة..." : "جدولة"}
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
                  <TableHead>العلاج</TableHead>
                  <TableHead>الإجراء الفرعي</TableHead>
                  <TableHead>السن</TableHead>
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
                  <TableHead>التاريخ</TableHead>
                  <TableHead>الطبيب</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>العلاجات</TableHead>
                  <TableHead>المدفوعات</TableHead>
                  <TableHead>الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appointments?.map((appointment) => (
                  <TableRow key={appointment.id}>
                    <TableCell>
                      {new Date(appointment.scheduled_at).toLocaleDateString()}
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
                          ${payment.amount} on {new Date(payment.paid_at).toLocaleDateString()}
                        </div>
                      ))}
                    </TableCell>
                    <TableCell>
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
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={newPayment.amount}
                onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })}
                required
              />
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
                    <TableHead>تاريخ الدفع</TableHead>
                    <TableHead>المبلغ الحالي</TableHead>
                    <TableHead>المبلغ الجديد</TableHead>
                    <TableHead>إجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appointmentPayments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        {new Date(payment.paid_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-semibold">
                        ${payment.amount.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="أدخل المبلغ الجديد"
                          value={editingPayments[payment.id] || ""}
                          onChange={(e) => setEditingPayments({
                            ...editingPayments,
                            [payment.id]: e.target.value
                          })}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          disabled={!editingPayments[payment.id] || updatePaymentMutation.isPending}
                          onClick={() => {
                            if (editingPayments[payment.id]) {
                              updatePaymentMutation.mutate({
                                paymentId: payment.id,
                                newAmount: parseFloat(editingPayments[payment.id])
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
                    <TableHead>التاريخ</TableHead>
                    <TableHead>العلاج</TableHead>
                    <TableHead>العلاج الفرعي</TableHead>
                    <TableHead>رقم السن</TableHead>
                    <TableHead>التكلفة</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>الطبيب</TableHead>
                    <TableHead>الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allTreatmentRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        {new Date(record.appointments?.scheduled_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>{record.treatments?.name}</TableCell>
                      <TableCell>{record.sub_treatments?.name}</TableCell>
                      <TableCell>{record.tooth_number}</TableCell>
                      <TableCell>${record.actual_cost?.toFixed(2) || "0.00"}</TableCell>
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
                        ${allPayments.reduce((sum, payment) => sum + Number(payment.amount), 0).toFixed(2)}
                      </div>
                      <p className="text-sm text-muted-foreground">إجمالي المدفوعات</p>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-blue-600">
                        ${(allTreatmentRecords?.reduce((sum, record) => sum + Number(record.actual_cost || 0), 0) || 0).toFixed(2)}
                      </div>
                      <p className="text-sm text-muted-foreground">إجمالي تكلفة العلاجات</p>
                    </div>
                    <div>
                      <div className={`text-2xl font-bold ${balance && balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        ${Math.abs(balance || 0).toFixed(2)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {balance && balance > 0 ? 'المبلغ المستحق' : 'رصيد زائد'}
                      </p>
                    </div>
                  </div>
                </div>
                
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>تاريخ الدفع</TableHead>
                      <TableHead>المبلغ</TableHead>
                      <TableHead>تاريخ الموعد</TableHead>
                      <TableHead>الطبيب</TableHead>
                      <TableHead>ملاحظات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allPayments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>
                          {new Date(payment.paid_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="font-semibold text-green-600">
                          ${payment.amount.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          {new Date(payment.appointments?.scheduled_at).toLocaleDateString()}
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