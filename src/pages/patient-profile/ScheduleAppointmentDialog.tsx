import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { appointmentsApi, type Appointment, type Doctor } from "@/api/clinic";

interface ScheduleAppointmentDialogProps {
  patientId: string;
  doctors: Doctor[] | undefined;
  patientFutureAppointments: Appointment[] | undefined;
  showError: (e: unknown) => void;
}

/** "جدولة موعد" quick action: doctor / specialty / date dialog showing the patient's upcoming appointments. */
export function ScheduleAppointmentDialog({ patientId, doctors, patientFutureAppointments, showError }: ScheduleAppointmentDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAppointmentDialogOpen, setIsAppointmentDialogOpen] = useState(false);

  const [newAppointment, setNewAppointment] = useState({
    doctor_id: "",
    specialty_id: "",
    scheduled_at: "",
    notes: "",
  });

  const selectedAppointmentDoctor = doctors?.find((d) => d.id === newAppointment.doctor_id);
  const doctorSpecialties = selectedAppointmentDoctor?.specialties ?? [];

  const createAppointmentMutation = useMutation({
    mutationFn: (appointment: typeof newAppointment) =>
      appointmentsApi.create({
        patient_id: patientId,
        doctor_id: appointment.doctor_id,
        specialty_id: appointment.specialty_id || undefined,
        scheduled_at: new Date(appointment.scheduled_at).toISOString(),
        notes: appointment.notes || null,
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["patient-appointments", patientId] });
      queryClient.invalidateQueries({ queryKey: ["patient-future-appointments", patientId] });
      setIsAppointmentDialogOpen(false);
      setNewAppointment({ doctor_id: "", specialty_id: "", scheduled_at: "", notes: "" });
      // Only one toast is shown at a time, so the conflicts warning carries the success text too.
      toast(created?.conflicts?.length
        ? {
            title: "تم جدولة الموعد — تنبيه",
            description: (
              <div className="space-y-1">
                {created.conflicts.map((c) => (
                  <p key={c.id}>
                    تنبيه: لدى الطبيب موعد قريب: {c.patient_name ?? "مريض"} الساعة <bdi dir="ltr">{format(new Date(c.scheduled_at), "HH:mm")}</bdi>
                  </p>
                ))}
              </div>
            ),
            duration: 10000,
          }
        : { title: "نجح", description: "تم جدولة الموعد بنجاح" });
    },
    onError: showError,
  });

  const handleScheduleAppointment = (e: React.FormEvent) => {
    e.preventDefault();
    createAppointmentMutation.mutate(newAppointment);
  };

  return (
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
            <Select
              value={newAppointment.doctor_id}
              onValueChange={(value) => {
                const doctor = doctors?.find((d) => d.id === value);
                const primary = doctor?.specialties?.find((s) => s.is_primary)?.id ?? doctor?.primary_specialty_id ?? "";
                setNewAppointment({ ...newAppointment, doctor_id: value, specialty_id: primary });
              }}
            >
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
          {doctorSpecialties.length > 1 && (
            <div>
              <Label htmlFor="specialty_id">التخصص</Label>
              <Select
                value={newAppointment.specialty_id}
                onValueChange={(value) => setNewAppointment({ ...newAppointment, specialty_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر التخصص" />
                </SelectTrigger>
                <SelectContent>
                  {doctorSpecialties.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name_ar}
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
                      - {apt.doctor?.full_name}
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
  );
}
