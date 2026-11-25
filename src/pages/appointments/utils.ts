import type { Appointment, Doctor, SubTreatmentStep, Treatment } from "@/api/clinic";

/** "1,250.5" -> 1250.5, "" -> null */
export const toNumberOrNull = (value: string): number | null => {
  const clean = value.replace(/,/g, "").trim();
  if (!clean) return null;
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
};

/**
 * Treatment plans and resuming multi-visit treatments are dental workflows.
 * The appointment's specialty decides; without one, the doctor's specialties
 * (unknown → dental, the clinic's default).
 */
export function isDentalAppointment(apt: Appointment | null | undefined, doctors: Doctor[] | undefined): boolean {
  if (!apt) return true;
  if (apt.specialty) return apt.specialty.is_dental;
  const doctor = doctors?.find((d) => d.id === apt.doctor_id);
  return !doctor || doctor.specialties.length === 0 || doctor.specialties.some((s) => s.is_dental);
}

export const sortSteps = (steps?: SubTreatmentStep[]) => [...(steps ?? [])].sort((a, b) => a.step_order - b.step_order);

export const emptyAppointmentForm = { patient_id: "", doctor_id: "", specialty_id: "", scheduled_at: "", notes: "" };

export type AppointmentForm = typeof emptyAppointmentForm;

/** State of the record-treatment form (amounts kept as raw strings without commas). */
export interface TreatmentRecordForm {
  treatment_id: string;
  sub_treatment_id: string;
  tooth_numbers: string[];
  actual_cost_syp: string;
  actual_cost_usd: string;
  payment_amount: string;
  payment_currency: string;
  notes: string;
  treatment_notes: string;
}

export const availableTableColumns = [
  { id: 'date_time', label: 'التاريخ والوقت' },
  { id: 'patient_name', label: 'اسم المريض' },
  { id: 'doctor_info', label: 'الطبيب' },
  { id: 'status', label: 'الحالة' },
  { id: 'notes', label: 'ملاحظات' },
  { id: 'actions', label: 'الإجراءات' }
];

// Any sub-treatment of the visible catalog (plans / resumed records)
export const findSubTreatment = (allTreatments: Treatment[] | undefined, id?: string | null) =>
  id ? allTreatments?.flatMap((t) => t.sub_treatments ?? []).find((st) => st.id === id) : undefined;

// Helper functions for number formatting
export const formatNumberWithCommas = (value: string) => {
  // Remove existing commas and non-numeric characters except decimal point
  const cleanValue = value.replace(/[^\d.]/g, '');

  // Split by decimal point
  const parts = cleanValue.split('.');

  // Add commas to the integer part
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  // Join back with decimal part if exists
  return parts.join('.');
};

export const removeCommas = (value: string) => {
  return value.replace(/,/g, '');
};

// Helper function to convert UTC date to local datetime-local format
export const formatDateForInput = (utcDateString: string) => {
  const date = new Date(utcDateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};
