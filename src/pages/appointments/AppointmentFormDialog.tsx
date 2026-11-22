import { useState, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Plus, Check, ChevronsUpDown } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { appointmentsApi, patientsApi, apiErrorMessage, type Appointment, type Doctor } from "@/api/clinic";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { AppointmentForm } from "./utils";

/** Description for a create/update toast: success text plus any nearby appointments of the same doctor (warning only). */
function conflictsDescription(message: string, conflicts: Appointment["conflicts"]) {
  if (!conflicts?.length) return message;
  return (
    <div className="space-y-1">
      <p>{message}</p>
      {conflicts.map((c) => (
        <p key={c.id} className="font-medium">
          تنبيه: لدى الطبيب موعد قريب: {c.patient_name ?? "مريض"} الساعة <bdi dir="ltr">{format(new Date(c.scheduled_at), "HH:mm")}</bdi>
        </p>
      ))}
    </div>
  );
}

interface AppointmentFormDialogProps {
  isDialogOpen: boolean;
  setIsDialogOpen: Dispatch<SetStateAction<boolean>>;
  editingAppointment: Appointment | null;
  setEditingAppointment: Dispatch<SetStateAction<Appointment | null>>;
  newAppointment: AppointmentForm;
  setNewAppointment: Dispatch<SetStateAction<AppointmentForm>>;
  selectedPatientLabel: string;
  setSelectedPatientLabel: Dispatch<SetStateAction<string>>;
  resetAppointmentForm: () => void;
  doctors: Doctor[] | undefined;
}

/** Create / edit appointment dialog (with its "موعد جديد" trigger button). */
export function AppointmentFormDialog({
  isDialogOpen,
  setIsDialogOpen,
  editingAppointment,
  setEditingAppointment,
  newAppointment,
  setNewAppointment,
  selectedPatientLabel,
  setSelectedPatientLabel,
  resetAppointmentForm,
  doctors,
}: AppointmentFormDialogProps) {
  const [openPatientCombobox, setOpenPatientCombobox] = useState(false);
  const [patientSearchQuery, setPatientSearchQuery] = useState("");

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isIndependentDoctor, doctorId: myDoctorId } = useUserRole();

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

  // Doctor chosen in the create/edit dialog (specialty select only when they have several)
  const formDoctor = doctors?.find((d) => d.id === newAppointment.doctor_id);
  const formDoctorHasManySpecialties = (formDoctor?.specialties?.length ?? 0) > 1;

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

  const createAppointmentMutation = useMutation({
    mutationFn: (appointment: typeof newAppointment) => appointmentsApi.create(appointmentPayload(appointment)),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["patient-future-appointments"] });
      setIsDialogOpen(false);
      resetAppointmentForm();
      toast({
        title: created?.conflicts?.length ? "تنبيه" : "Success",
        description: conflictsDescription("Appointment created successfully", created?.conflicts),
        ...(created?.conflicts?.length ? { duration: 10000 } : {}),
      });
    },
    onError: (e) => {
      toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" });
    },
  });

  const updateAppointmentMutation = useMutation({
    mutationFn: (appointment: typeof newAppointment & { id: string }) =>
      appointmentsApi.update(appointment.id, appointmentPayload(appointment)),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["patient-future-appointments"] });
      setIsDialogOpen(false);
      setEditingAppointment(null);
      resetAppointmentForm();
      toast({
        title: updated?.conflicts?.length ? "تنبيه" : "نجح",
        description: conflictsDescription("تم تحديث الموعد بنجاح", updated?.conflicts),
        ...(updated?.conflicts?.length ? { duration: 10000 } : {}),
      });
    },
    onError: (e) => {
      toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingAppointment) {
      updateAppointmentMutation.mutate({ ...newAppointment, id: editingAppointment.id });
    } else {
      createAppointmentMutation.mutate(newAppointment);
    }
  };

  return (
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
  );
}
