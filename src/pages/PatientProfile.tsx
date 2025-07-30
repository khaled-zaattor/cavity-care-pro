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
import { ArrowLeft, Plus, Calendar, CreditCard } from "lucide-react";
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
  const [selectedAppointmentId, setSelectedAppointmentId] = useState("");

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
          treatments (estimated_cost),
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

      const totalCost = treatmentRecords?.reduce((sum, record) => sum + Number(record.treatments?.estimated_cost || 0), 0) || 0;
      const totalPaid = payments?.reduce((sum, payment) => sum + Number(payment.amount), 0) || 0;

      return totalCost - totalPaid;
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
      toast({ title: "Success", description: "Appointment scheduled successfully" });
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
      setIsPaymentDialogOpen(false);
      setNewPayment({ amount: "" });
      toast({ title: "Success", description: "Payment recorded successfully" });
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

  if (!patient) return <div>Loading patient...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Button variant="outline" onClick={() => navigate("/patients")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Patients
        </Button>
        <h1 className="text-3xl font-bold">{patient.full_name}</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Patient Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <strong>Date of Birth:</strong> {new Date(patient.date_of_birth).toLocaleDateString()}
            </div>
            <div>
              <strong>Phone:</strong> {patient.phone_number}
            </div>
            {patient.contact && (
              <div>
                <strong>Contact:</strong> {patient.contact}
              </div>
            )}
            {patient.medical_notes && (
              <div>
                <strong>Medical Notes:</strong> {patient.medical_notes}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${balance?.toFixed(2) || "0.00"}
            </div>
            <p className="text-muted-foreground">Outstanding balance</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Dialog open={isAppointmentDialogOpen} onOpenChange={setIsAppointmentDialogOpen}>
              <DialogTrigger asChild>
                <Button className="w-full">
                  <Calendar className="mr-2 h-4 w-4" />
                  Schedule Appointment
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Schedule New Appointment</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleScheduleAppointment} className="space-y-4">
                  <div>
                    <Label htmlFor="doctor_id">Doctor</Label>
                    <Select value={newAppointment.doctor_id} onValueChange={(value) => setNewAppointment({ ...newAppointment, doctor_id: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a doctor" />
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
                    <Label htmlFor="scheduled_at">Date & Time</Label>
                    <Input
                      id="scheduled_at"
                      type="datetime-local"
                      value={newAppointment.scheduled_at}
                      onChange={(e) => setNewAppointment({ ...newAppointment, scheduled_at: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      value={newAppointment.notes}
                      onChange={(e) => setNewAppointment({ ...newAppointment, notes: e.target.value })}
                    />
                  </div>
                  <Button type="submit" disabled={createAppointmentMutation.isPending}>
                    {createAppointmentMutation.isPending ? "Scheduling..." : "Schedule"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appointments History</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Treatments</TableHead>
                <TableHead>Payments</TableHead>
                <TableHead>Actions</TableHead>
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
                      {appointment.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    {appointment.treatment_records?.map((record, index) => (
                      <div key={index} className="text-sm">
                        {record.treatments?.name} - {record.sub_treatments?.name} (Tooth {record.tooth_number})
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedAppointmentId(appointment.id);
                        setIsPaymentDialogOpen(true);
                      }}
                    >
                      <CreditCard className="h-4 w-4 mr-1" />
                      Add Payment
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRecordPayment} className="space-y-4">
            <div>
              <Label htmlFor="amount">Payment Amount</Label>
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
              {createPaymentMutation.isPending ? "Recording..." : "Record Payment"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}