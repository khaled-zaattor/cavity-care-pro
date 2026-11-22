// Typed client for the Laravel API (backend/routes/api.php).
// Relation names follow Laravel: `patient`, `doctor`, `specialty`, `treatment`,
// `sub_treatment`, `treatment_records`, `payments` (Supabase used plural names).
import { api, API_BASE } from "./client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Currency = "SYP" | "USD";
export type AppointmentStatus = "Scheduled" | "Completed" | "Cancelled";
export type ToothAssociation = "not_related" | "single_tooth" | "multiple_teeth";
export type WaitingStatus = "waiting" | "in_examination" | "completed";

export interface Paginated<T> {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

export interface Specialty {
  id: string;
  name_ar: string;
  name_en: string | null;
  code: string | null;
  is_dental: boolean;
  color: string | null;
  sort_order: number;
  is_active: boolean;
  doctors_count?: number;
  treatments_count?: number;
}

export interface DoctorSpecialty {
  id: string;
  name_ar: string;
  is_dental: boolean;
  color: string | null;
  is_primary: boolean;
}

export interface Doctor {
  id: string;
  full_name: string;
  email: string | null;
  phone_number: string | null;
  /** primary specialty name (kept for old displays) */
  specialty: string | null;
  primary_specialty_id: string | null;
  specialties: DoctorSpecialty[];
  has_own_books: boolean;
  user_id: string | null;
  user: { id: string; email: string; full_name: string | null } | null;
  print_header: string | null;
}

export interface Patient {
  id: string;
  full_name: string;
  date_of_birth: string | null;
  phone_number: string | null;
  address: string | null;
  contact: string | null;
  job: string | null;
  medical_notes: string | null;
  created_at: string;
  updated_at: string;
  /** included in GET /patients lists */
  appointments_count?: number;
}

export interface PatientLite {
  id: string;
  full_name: string;
  phone_number: string | null;
}

export interface SubTreatmentStep {
  id: string;
  sub_treatment_id: string;
  step_name: string;
  step_description: string | null;
  step_order: number;
  completion_percentage: number | null;
}

export interface SubTreatment {
  id: string;
  treatment_id: string;
  name: string;
  estimated_cost_syp: number | null;
  estimated_cost_usd: number | null;
  tooth_association: ToothAssociation;
  steps?: SubTreatmentStep[];
}

export interface Treatment {
  id: string;
  name: string;
  description: string | null;
  doctor_id: string | null;
  specialty_id: string;
  specialty?: Pick<Specialty, "id" | "name_ar" | "is_dental" | "color"> | null;
  sub_treatments?: SubTreatment[];
}

export interface Payment {
  id: string;
  appointment_id: string;
  patient_id: string;
  doctor_id: string;
  specialty_id: string | null;
  amount: number;
  currency: Currency;
  paid_at: string;
  notes?: string | null;
  appointment?: { id: string; scheduled_at: string; doctor_id?: string; doctor?: { id: string; full_name: string } | null; patient?: { id: string; full_name: string } | null };
}

export interface TreatmentRecord {
  id: string;
  appointment_id: string;
  patient_id: string;
  doctor_id: string;
  specialty_id: string | null;
  treatment_id: string;
  sub_treatment_id: string;
  tooth_number: string | null;
  actual_cost_syp: number | null;
  actual_cost_usd: number | null;
  is_completed: boolean;
  performed_at: string;
  treatment_notes: string | null;
  created_at: string;
  treatment?: { id: string; name: string } | null;
  sub_treatment?: { id: string; name: string; tooth_association?: ToothAssociation } | null;
  appointment?: { id: string; scheduled_at: string; doctor_id?: string; doctor?: { id: string; full_name: string } | null; patient?: { id: string; full_name: string } | null };
  executed_steps?: string[];
}

export interface Appointment {
  id: string;
  patient_id: string;
  doctor_id: string;
  specialty_id: string | null;
  scheduled_at: string;
  status: AppointmentStatus;
  notes: string | null;
  created_at: string;
  patient?: PatientLite | null;
  doctor?: { id: string; full_name: string } | null;
  specialty?: { id: string; name_ar: string; is_dental: boolean; color: string | null } | null;
  payments?: Payment[];
  treatment_records?: TreatmentRecord[];
  /** create/update only: the doctor's other scheduled appointments within 15 min (warning, not an error) */
  conflicts?: { id: string; patient_name: string | null; scheduled_at: string }[];
}

export interface TreatmentPlan {
  id: string;
  patient_id: string;
  treatment_id: string;
  sub_treatment_id: string;
  tooth_number: string | null;
  appointment_id: string | null;
  is_executed: boolean;
  executed_at: string | null;
  created_at: string;
  treatment?: { id: string; name: string; doctor_id: string | null } | null;
  sub_treatment?: { id: string; name: string; estimated_cost_syp: number | null; estimated_cost_usd: number | null } | null;
}

export interface UnfinishedTreatment {
  id: string;
  patient_id: string;
  treatment_id: string;
  sub_treatment_id: string;
  tooth_number: string | null;
  last_appointment_id: string | null;
  started_at: string | null;
  notes: string | null;
  treatment_name: string;
  sub_treatment_name: string;
}

export interface Balance {
  syp: number;
  usd: number;
  total_cost_syp: number;
  total_cost_usd: number;
  total_paid_syp: number;
  total_paid_usd: number;
  by_books: { doctor_id: string | null; name: string; syp: number; usd: number }[];
  by_specialty: { specialty_id: string | null; name: string; syp: number; usd: number }[];
}

export interface WaitingEntry {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  doctor_id: string | null;
  clinic_arrival_time: string;
  examination_room_entry_time: string | null;
  status: WaitingStatus;
  patient?: PatientLite | null;
  doctor?: { id: string; full_name: string } | null;
  appointment?: { id: string; scheduled_at: string } | null;
}

export interface Stats {
  appointments_count: number;
  treatments_count: number;
  new_patients_count: number | null;
  treatment_cost_syp: number;
  treatment_cost_usd: number;
  total_payments_syp: number;
  total_payments_usd: number;
  revenue_syp: number;
  revenue_usd: number;
}

export interface RevenueRow {
  doctor_id: string | null;
  doctor_name: string | null;
  specialty_id: string | null;
  specialty_name: string | null;
  treatments: number;
  charged_syp: number;
  charged_usd: number;
  collected_syp: number;
  collected_usd: number;
}

export interface RevenueReport {
  group_by: "doctor" | "specialty" | "doctor_specialty";
  rows: RevenueRow[];
  totals: Omit<RevenueRow, "doctor_id" | "doctor_name" | "specialty_id" | "specialty_name">;
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  role: string | null;
  is_active: boolean;
  last_login_at: string | null;
  doctor: { id: string; full_name: string; has_own_books: boolean } | null;
}

export interface RolePermission {
  id: string;
  role: string;
  resource: string;
  can_create: boolean;
  can_update: boolean;
  can_delete: boolean;
}

type Data<T> = { data: T };
const d = <T>(p: Promise<Data<T>>) => p.then((r) => r.data);

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export const specialtiesApi = {
  list: (includeInactive = false) => d(api.get<Data<Specialty[]>>("/specialties", { include_inactive: includeInactive ? 1 : undefined })),
  create: (body: Partial<Specialty>) => d(api.post<Data<Specialty>>("/specialties", body)),
  update: (id: string, body: Partial<Specialty>) => d(api.patch<Data<Specialty>>(`/specialties/${id}`, body)),
  remove: (id: string) => api.delete(`/specialties/${id}`),
};

export interface DoctorInput {
  full_name?: string;
  email?: string | null;
  phone_number?: string | null;
  has_own_books?: boolean;
  user_id?: string | null;
  print_header?: string | null;
  specialty_ids?: string[];
  primary_specialty_id?: string | null;
}

export const doctorsApi = {
  list: (params: { specialty_id?: string } = {}) => d(api.get<Data<Doctor[]>>("/doctors", params)),
  get: (id: string) => d(api.get<Data<Doctor>>(`/doctors/${id}`)),
  create: (body: DoctorInput) => d(api.post<Data<Doctor>>("/doctors", body)),
  update: (id: string, body: DoctorInput) => d(api.patch<Data<Doctor>>(`/doctors/${id}`, body)),
  remove: (id: string) => api.delete(`/doctors/${id}`),
};

export const catalogApi = {
  list: (params: { specialty_id?: string; doctor_id?: string } = {}) => d(api.get<Data<Treatment[]>>("/treatments", params)),
  createTreatment: (body: { name: string; description?: string | null; specialty_id: string; doctor_id?: string | null }) =>
    d(api.post<Data<Treatment>>("/treatments", body)),
  updateTreatment: (id: string, body: { name?: string; description?: string | null; specialty_id?: string }) =>
    d(api.patch<Data<Treatment>>(`/treatments/${id}`, body)),
  removeTreatment: (id: string) => api.delete(`/treatments/${id}`),
  createSub: (body: Partial<SubTreatment> & { treatment_id: string; name: string }) => d(api.post<Data<SubTreatment>>("/sub-treatments", body)),
  updateSub: (id: string, body: Partial<SubTreatment>) => d(api.patch<Data<SubTreatment>>(`/sub-treatments/${id}`, body)),
  removeSub: (id: string) => api.delete(`/sub-treatments/${id}`),
  createStep: (body: Omit<SubTreatmentStep, "id">) => d(api.post<Data<SubTreatmentStep>>("/sub-treatment-steps", body)),
  updateStep: (id: string, body: Partial<SubTreatmentStep>) => d(api.patch<Data<SubTreatmentStep>>(`/sub-treatment-steps/${id}`, body)),
  removeStep: (id: string) => api.delete(`/sub-treatment-steps/${id}`),
};

export type PatientInput = Partial<Omit<Patient, "id" | "created_at" | "updated_at">>;

export const patientsApi = {
  list: (params: { search?: string; filter?: "duplicates" | "no_appointments"; page?: number; per_page?: number } = {}) =>
    api.get<Paginated<Patient>>("/patients", params),
  /** every patient (Excel export) */
  all: (params: { search?: string } = {}) => api.get<Paginated<Patient>>("/patients", { ...params, per_page: 10000 }).then((r) => r.data),
  search: (q: string) => d(api.get<Data<PatientLite[]>>("/patients/search", { q })),
  /** admin: duplicate patients with no appointments (and nothing attached) that the cleanup would delete */
  duplicatesPreview: () =>
    api.get<{ count: number; data: { id: string; full_name: string; phone_number: string | null; created_at: string }[] }>("/patients/duplicates/cleanup"),
  duplicatesCleanup: (ids: string[]) => api.post<{ deleted: number }>("/patients/duplicates/cleanup", { ids }),
  get: (id: string) => d(api.get<Data<Patient>>(`/patients/${id}`)),
  create: (body: PatientInput) => d(api.post<Data<Patient>>("/patients", body)),
  update: (id: string, body: PatientInput) => d(api.patch<Data<Patient>>(`/patients/${id}`, body)),
  remove: (id: string) => api.delete(`/patients/${id}`),
  import: (rows: PatientInput[]) => api.post<{ inserted: number; skipped: number; skipped_names: string[] }>("/patients/import", { rows }),

  appointments: (id: string) => d(api.get<Data<Appointment[]>>(`/patients/${id}/appointments`)),
  treatmentRecords: (id: string, incomplete = false) =>
    d(api.get<Data<TreatmentRecord[]>>(`/patients/${id}/treatment-records`, { incomplete: incomplete ? 1 : undefined })),
  payments: (id: string) => d(api.get<Data<Payment[]>>(`/patients/${id}/payments`)),
  balance: (id: string) => d(api.get<Data<Balance>>(`/patients/${id}/balance`)),
  plans: (id: string, pending = false) => d(api.get<Data<TreatmentPlan[]>>(`/patients/${id}/treatment-plans`, { pending: pending ? 1 : undefined })),
  unfinished: (id: string) => d(api.get<Data<UnfinishedTreatment[]>>(`/patients/${id}/unfinished`)),
};

export interface AppointmentFilters {
  doctor_id?: string;
  patient_id?: string;
  patient_name?: string;
  specialty_id?: string;
  status?: AppointmentStatus;
  from?: string;
  to?: string;
  upcoming?: boolean;
  page?: number;
  per_page?: number;
}

export interface TreatmentInput {
  actual_cost_syp?: number | null;
  actual_cost_usd?: number | null;
  payment_amount?: number | null;
  payment_currency?: Currency;
  notes?: string | null;
  treatment_notes?: string | null;
  step_ids?: string[];
}

export const appointmentsApi = {
  list: (f: AppointmentFilters = {}) =>
    api.get<Paginated<Appointment>>("/appointments", { ...f, upcoming: f.upcoming ? 1 : undefined } as Record<string, string | number | undefined>),
  today: () => d(api.get<Data<Appointment[]>>("/appointments/today")),
  get: (id: string) => d(api.get<Data<Appointment>>(`/appointments/${id}`)),
  create: (body: { patient_id: string; doctor_id: string; specialty_id?: string | null; scheduled_at: string; notes?: string | null; status?: AppointmentStatus }) =>
    d(api.post<Data<Appointment>>("/appointments", body)),
  update: (id: string, body: Partial<{ patient_id: string; doctor_id: string; specialty_id: string | null; scheduled_at: string; notes: string | null; status: AppointmentStatus }>) =>
    d(api.patch<Data<Appointment>>(`/appointments/${id}`, body)),
  remove: (id: string) => api.delete(`/appointments/${id}`),
  bulkDeletePreview: (from: string, to: string) =>
    api.get<{ appointments: Appointment[]; payments: Payment[]; treatment_records: TreatmentRecord[]; totals: { payments_syp: number; payments_usd: number } }>(
      "/appointments/bulk-delete-preview", { from, to }),
  bulkDelete: (from: string, to: string) => api.post<{ deleted: number }>("/appointments/bulk-delete", { from, to }),
  import: (rows: { patient_name: string; doctor_name: string; scheduled_at: string; notes?: string | null; status?: AppointmentStatus }[]) =>
    api.post<{ created: number; failed: { row: number; reason: string }[] }>("/appointments/import", { rows }),

  recordTreatment: (id: string, body: TreatmentInput & { treatment_id: string; sub_treatment_id: string; tooth_numbers?: string[] }) =>
    d(api.post<Data<TreatmentRecord>>(`/appointments/${id}/treatments`, body)),
  resume: (id: string, body: { treatment_record_id: string; step_ids: string[]; notes?: string | null }) =>
    d(api.post<Data<TreatmentRecord>>(`/appointments/${id}/resume`, body)),
  executePlan: (id: string, body: TreatmentInput & { treatment_plan_id: string }) =>
    d(api.post<Data<TreatmentRecord>>(`/appointments/${id}/execute-plan`, body)),
  /** step ids done in this appointment, or (with recordId) across all sessions of that treatment */
  completedSteps: (id: string, recordId?: string) =>
    d(api.get<Data<string[]>>(`/appointments/${id}/completed-steps`, { treatment_record_id: recordId })),
  payments: (id: string) => d(api.get<Data<Payment[]>>(`/appointments/${id}/payments`)),
};

export const moneyApi = {
  addPayment: (body: { appointment_id: string; amount: number; currency: Currency }) => d(api.post<Data<Payment>>("/payments", body)),
  updatePayment: (id: string, amount: number) => d(api.patch<Data<Payment>>(`/payments/${id}`, { amount })),
  removePayment: (id: string) => api.delete(`/payments/${id}`),
  updateRecord: (id: string, body: Partial<Pick<TreatmentRecord, "actual_cost_syp" | "actual_cost_usd" | "is_completed" | "treatment_notes">>) =>
    d(api.patch<Data<TreatmentRecord>>(`/treatment-records/${id}`, body)),
  removeRecord: (id: string) => api.delete(`/treatment-records/${id}`),
  createPlan: (body: { patient_id: string; treatment_id: string; sub_treatment_id: string; tooth_numbers?: string[] }) =>
    d(api.post<Data<TreatmentPlan>>("/treatment-plans", body)),
  removePlan: (id: string) => api.delete(`/treatment-plans/${id}`),
};

export const waitingListApi = {
  list: (active = false) => api.get<{ data: WaitingEntry[]; version: string }>("/waiting-list", { active: active ? 1 : undefined }),
  add: (patient_id: string, doctor_id?: string | null) => d(api.post<Data<WaitingEntry>>("/waiting-list", { patient_id, doctor_id: doctor_id ?? null })),
  enterExam: (id: string) => d(api.patch<Data<WaitingEntry>>(`/waiting-list/${id}`, { action: "enter_exam" })),
  complete: (id: string) => d(api.patch<Data<WaitingEntry>>(`/waiting-list/${id}`, { action: "complete" })),
  editTimes: (id: string, clinic_arrival_time: string, examination_room_entry_time?: string | null) =>
    d(api.patch<Data<WaitingEntry>>(`/waiting-list/${id}`, { clinic_arrival_time, examination_room_entry_time })),
  completeAllInExam: () => api.post<{ updated: number }>("/waiting-list/complete-in-exam"),
  remove: (id: string) => api.delete(`/waiting-list/${id}`),
  clearCompleted: (ids?: string[]) => api.post<{ deleted: number }>("/waiting-list/clear-completed", ids ? { ids } : undefined),
};

export const reportsApi = {
  stats: (from: string, to: string, books: string = "all") => d(api.get<Data<Stats>>("/stats", { from, to, books })),
  revenue: (from: string, to: string, group_by: RevenueReport["group_by"] = "doctor") =>
    d(api.get<Data<RevenueReport>>("/reports/revenue", { from, to, group_by })),
};

export const adminApi = {
  users: (role?: string) => d(api.get<Data<AdminUser[]>>("/admin/users", { role })),
  createUser: (body: { email: string; full_name: string; role: string; password: string }) => d(api.post<Data<AdminUser>>("/admin/users", body)),
  updateUser: (id: string, body: { full_name?: string; role?: string | null; is_active?: boolean }) => d(api.patch<Data<AdminUser>>(`/admin/users/${id}`, body)),
  resetPassword: (id: string, password: string) => api.post(`/admin/users/${id}/reset-password`, { password }),
  rolePermissions: () => d(api.get<Data<RolePermission[]>>("/role-permissions")),
  setRolePermission: (body: { role: string; resource: string; can_create?: boolean; can_update?: boolean; can_delete?: boolean }) =>
    d(api.put<Data<RolePermission>>("/role-permissions", body)),
  changeOwnPassword: (current_password: string, password: string) =>
    api.post("/auth/password", { current_password, password, password_confirmation: password }),
};

export type ActivitySubject =
  | "appointment" | "payment" | "treatment_record" | "treatment_plan" | "patient" | "doctor" | "user"
  // price list (treatments / sub-treatments) and settings (specialties / role permissions)
  | "treatment" | "settings" | "prescription" | "patient_file";
export type ActivityEvent = "created" | "updated" | "deleted" | "imported";

export interface ActivityLogEntry {
  id: string;
  user_id: string | null;
  user_name: string | null;
  event: ActivityEvent;
  subject_type: ActivitySubject;
  subject_id: string | null;
  patient_id: string | null;
  doctor_id: string | null;
  description: string;
  properties: { old: Record<string, unknown>; new: Record<string, unknown> } | null;
  is_money: boolean;
  created_at: string;
}

export interface ActivityLogFilters {
  user_id?: string;
  patient_id?: string;
  subject_type?: ActivitySubject;
  event?: ActivityEvent;
  from?: string;
  to?: string;
  search?: string;
  important?: 1;
  page?: number;
  per_page?: number;
}

export const activityLogsApi = {
  list: (params: ActivityLogFilters = {}) => api.get<Paginated<ActivityLogEntry>>("/activity-logs", { ...params }),
  users: () => d(api.get<Data<{ id: string; name: string }[]>>("/activity-logs/users")),
};

// ---------------------------------------------------------------------------
// Phase E: medicines, prescriptions, templates, printed header
// ---------------------------------------------------------------------------

export interface Medicine {
  id: string;
  trade_name: string;
  generic_name: string | null;
  form: string | null;
  strength: string | null;
  default_dose: string | null;
  default_frequency: string | null;
  default_duration: string | null;
  notes: string | null;
  specialty_id: string | null;
  is_active: boolean;
}

export interface PrescriptionItemInput {
  medicine_id?: string | null;
  medicine_name?: string | null;
  dose?: string | null;
  frequency?: string | null;
  duration?: string | null;
  route?: string | null;
  quantity?: string | null;
  instructions?: string | null;
}

export interface PrescriptionItem extends PrescriptionItemInput {
  id: string;
  medicine_name: string;
  sort_order: number;
}

export interface Prescription {
  id: string;
  number: number;
  patient_id: string;
  doctor_id: string;
  specialty_id: string | null;
  appointment_id: string | null;
  diagnosis: string | null;
  notes: string | null;
  issued_at: string;
  printed_at: string | null;
  items: PrescriptionItem[];
  patient?: { id: string; full_name: string; date_of_birth: string | null; phone_number: string | null } | null;
  doctor?: { id: string; full_name: string; print_header: string | null } | null;
  specialty?: { id: string; name_ar: string } | null;
}

export interface ClinicHeader {
  name: string | null;
  name_en: string | null;
  address: string | null;
  phone: string | null;
  footer: string | null;
  has_logo: boolean;
}

export interface PrescriptionTemplate {
  id: string;
  doctor_id: string;
  name: string;
  diagnosis: string | null;
  notes: string | null;
  items: PrescriptionItem[];
}

export interface ClinicSettings {
  clinic_name: string | null;
  clinic_name_en: string | null;
  clinic_address: string | null;
  clinic_phone: string | null;
  prescription_footer: string | null;
  has_logo: boolean;
}

export const medicinesApi = {
  list: (params: { q?: string; include_inactive?: boolean; specialty_id?: string } = {}) =>
    d(api.get<Data<Medicine[]>>("/medicines", { ...params, include_inactive: params.include_inactive ? 1 : undefined })),
  create: (body: Partial<Medicine> & { trade_name: string }) => d(api.post<Data<Medicine>>("/medicines", body)),
  update: (id: string, body: Partial<Medicine>) => d(api.patch<Data<Medicine>>(`/medicines/${id}`, body)),
  remove: (id: string) => api.delete(`/medicines/${id}`),
};

export const prescriptionsApi = {
  list: (params: { patient_id?: string; doctor_id?: string; page?: number; per_page?: number } = {}) =>
    api.get<Paginated<Prescription>>("/prescriptions", params),
  get: (id: string) => api.get<{ data: Prescription; clinic: ClinicHeader }>(`/prescriptions/${id}`),
  create: (body: { patient_id: string; doctor_id?: string | null; appointment_id?: string | null; specialty_id?: string | null; diagnosis?: string | null; notes?: string | null; items: PrescriptionItemInput[] }) =>
    d(api.post<Data<Prescription>>("/prescriptions", body)),
  update: (id: string, body: { diagnosis?: string | null; notes?: string | null; specialty_id?: string | null; items?: PrescriptionItemInput[] }) =>
    d(api.patch<Data<Prescription>>(`/prescriptions/${id}`, body)),
  remove: (id: string) => api.delete(`/prescriptions/${id}`),
  markPrinted: (id: string) => api.post(`/prescriptions/${id}/printed`),
};

export const prescriptionTemplatesApi = {
  list: (doctor_id?: string) => d(api.get<Data<PrescriptionTemplate[]>>("/prescription-templates", { doctor_id })),
  create: (body: { doctor_id?: string | null; name: string; diagnosis?: string | null; notes?: string | null; items: PrescriptionItemInput[] }) =>
    d(api.post<Data<PrescriptionTemplate>>("/prescription-templates", body)),
  update: (id: string, body: { name?: string; diagnosis?: string | null; notes?: string | null; items?: PrescriptionItemInput[] }) =>
    d(api.patch<Data<PrescriptionTemplate>>(`/prescription-templates/${id}`, body)),
  remove: (id: string) => api.delete(`/prescription-templates/${id}`),
};

export const clinicSettingsApi = {
  get: () => d(api.get<Data<ClinicSettings>>("/clinic-settings")),
  update: (body: Partial<Omit<ClinicSettings, "has_logo">>) => d(api.put<Data<ClinicSettings>>("/clinic-settings", body)),
  uploadLogo: (file: File) => {
    const form = new FormData();
    form.append("logo", file);
    return d(api.post<Data<ClinicSettings>>("/clinic-settings/logo", form));
  },
  removeLogo: () => d(api.delete<Data<ClinicSettings>>("/clinic-settings/logo")),
  /** <img src> for the logo (same-origin, session cookie). */
  logoUrl: (bust?: string | number) => `${API_BASE}/clinic-settings/logo${bust ? `?v=${bust}` : ""}`,
};

// ---------------------------------------------------------------------------
// Phase F: patient files and medical timeline
// ---------------------------------------------------------------------------

export type PatientFileCategory = "xray" | "radiology" | "lab_test" | "report" | "photo" | "prescription_scan" | "other";

export interface PatientFile {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  doctor_id: string | null;
  specialty_id: string | null;
  category: PatientFileCategory;
  title: string;
  taken_at: string | null; // YYYY-MM-DD
  notes: string | null;
  original_name: string;
  mime: string;
  size: number;
  is_image: boolean;
  has_thumbnail: boolean;
  created_at: string;
  uploader?: { id: string; full_name: string | null; email: string } | null;
  doctor?: { id: string; full_name: string } | null;
  specialty?: { id: string; name_ar: string; color: string | null } | null;
}

export interface TimelineEvent {
  type: "appointment" | "treatment" | "prescription" | "file" | "payment";
  id: string;
  at: string;
  title: string;
  detail: string | null;
  doctor: string | null;
  specialty: { id: string; name: string; color: string | null } | null;
  status?: AppointmentStatus;
  completed?: boolean;
  amount_syp?: number;
  amount_usd?: number;
  amount?: number;
  currency?: Currency;
  is_image?: boolean;
  has_thumbnail?: boolean;
  mime?: string;
}

export interface StorageUsage {
  files_count: number;
  files_bytes: number;
  disk_total_bytes: number | null;
  disk_free_bytes: number | null;
  disk_used_percent: number | null;
  warning: boolean;
  warning_percent: number;
}

export const patientFilesApi = {
  list: (patientId: string, category?: PatientFileCategory) =>
    api.get<{ data: PatientFile[]; categories: Record<PatientFileCategory, string>; max_upload_mb: number }>(
      `/patients/${patientId}/files`, { category }),
  upload: (patientId: string, file: File, meta: { category: PatientFileCategory; title?: string; taken_at?: string; notes?: string; appointment_id?: string | null }) => {
    const form = new FormData();
    form.append("file", file);
    form.append("category", meta.category);
    if (meta.title) form.append("title", meta.title);
    if (meta.taken_at) form.append("taken_at", meta.taken_at);
    if (meta.notes) form.append("notes", meta.notes);
    if (meta.appointment_id) form.append("appointment_id", meta.appointment_id);
    return d(api.post<Data<PatientFile>>(`/patients/${patientId}/files`, form));
  },
  update: (id: string, body: Partial<Pick<PatientFile, "category" | "title" | "taken_at" | "notes">>) =>
    d(api.patch<Data<PatientFile>>(`/patient-files/${id}`, body)),
  remove: (id: string) => api.delete(`/patient-files/${id}`),
  /** Same-origin URLs (session cookie) for <img>/<a>. */
  contentUrl: (id: string, download = false) => `${API_BASE}/patient-files/${id}/content${download ? "?download=1" : ""}`,
  thumbnailUrl: (id: string) => `${API_BASE}/patient-files/${id}/thumbnail`,
};

export const timelineApi = {
  get: (patientId: string, params: { specialty_id?: string; types?: string } = {}) =>
    api.get<{ data: TimelineEvent[]; specialties: { id: string; name: string; color: string | null }[] }>(
      `/patients/${patientId}/timeline`, params),
};

export const storageApi = {
  usage: () => d(api.get<Data<StorageUsage>>("/admin/storage")),
};

// ---------------------------------------------------------------------------
// Phase G: attendance, finance, settlement; dashboard; payment receipts
// ---------------------------------------------------------------------------

export type Allocation = "clinic_wide" | "specialty" | "doctor";

export interface AttendanceRow {
  id: string;
  doctor_id: string;
  date: string;
  check_in: string;
  check_out: string | null;
  minutes: number | null;
  source: "live" | "manual";
  notes: string | null;
  doctor?: { id: string; full_name: string } | null;
}

export interface AttendanceToday {
  doctor_id: string;
  doctor_name: string;
  checked_in: boolean;
  open_since: string | null;
  today_minutes: number;
  spans: AttendanceRow[];
}

export interface CompensationRule {
  id: string;
  doctor_id: string;
  specialty_id: string | null;
  percent: number;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  doctor?: { id: string; full_name: string } | null;
  specialty?: { id: string; name_ar: string } | null;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  default_allocation: Allocation;
  is_active: boolean;
}

export interface Expense {
  id: string;
  category_id: string;
  amount: number;
  currency: Currency;
  spent_at: string;
  allocation: Allocation;
  doctor_id: string | null;
  specialty_id: string | null;
  recurring_expense_id: string | null;
  notes: string | null;
  category?: { id: string; name: string } | null;
  doctor?: { id: string; full_name: string } | null;
  specialty?: { id: string; name_ar: string } | null;
}

export interface RecurringExpense extends Omit<Expense, "spent_at" | "recurring_expense_id" | "doctor" | "specialty"> {
  is_active: boolean;
  last_generated_period: string | null;
  /** already added as an expense for the month that was asked for */
  posted?: boolean;
}

export interface SettlementRow {
  doctor_id: string;
  doctor_name: string;
  has_own_books: boolean;
  currency: Currency;
  hours: number;
  revenue: number;
  direct_expenses: number;
  allocated_expenses: number;
  carried_loss: number;
  net: number;
  percent: number;
  doctor_share: number;
  clinic_share: number;
  paid: number;
  owed: number;
  details?: {
    per_specialty?: { specialty_id: string | null; revenue: number; percent: number }[];
    allocation?: { type: "clinic_wide" | "specialty"; specialty_id?: string; total: number; ratio: number }[];
  };
}

export interface SettlementPeriod {
  period: string;
  closed: boolean;
  closed_at: string | null;
  allocation_basis: "hours" | "revenue";
  total_hours: number;
  rows: SettlementRow[];
  warnings: string[];
}

export interface DoctorPayout {
  id: string;
  doctor_id: string;
  period: string | null;
  amount: number;
  currency: Currency;
  paid_at: string;
  notes: string | null;
  doctor?: { id: string; full_name: string } | null;
}

export interface DashboardData {
  role: string;
  today: {
    appointments: number;
    scheduled: number;
    completed: number;
    next: { id: string; scheduled_at: string; patient: { id: string; full_name: string } | null; doctor: { id: string; full_name: string } | null }[];
    waiting: number;
    in_examination: number;
    doctors_in: number;
  };
  doctor?: { unfinished_treatments: number; month: Stats };
  admin?: {
    month: Stats;
    by_specialty: RevenueRow[];
    by_doctor: RevenueRow[];
    top_debtors: { patient_id: string; full_name: string; balance: number }[];
  };
}

export const attendanceApi = {
  list: (params: { doctor_id?: string; from?: string; to?: string } = {}) =>
    api.get<{ data: AttendanceRow[]; hours_by_doctor: Record<string, number>; from: string; to: string }>("/attendance", params),
  today: () => api.get<{ data: AttendanceToday[]; date: string }>("/attendance/today"),
  checkIn: (doctor_id?: string) => d(api.post<Data<AttendanceRow>>("/attendance/check-in", { doctor_id })),
  checkOut: (doctor_id?: string) => d(api.post<Data<AttendanceRow>>("/attendance/check-out", { doctor_id })),
  /** admin: add a forgotten day (times "HH:mm", clinic local) */
  add: (body: { doctor_id: string; date: string; check_in: string; check_out: string; notes?: string | null }) =>
    d(api.post<Data<AttendanceRow>>("/attendance", body)),
  update: (id: string, body: { check_in?: string; check_out?: string; notes?: string | null }) =>
    d(api.patch<Data<AttendanceRow>>(`/attendance/${id}`, body)),
  remove: (id: string) => api.delete(`/attendance/${id}`),
};

export const financeApi = {
  settlements: (period: string) => d(api.get<Data<SettlementPeriod>>("/settlements", { period })),
  mySettlement: (period: string) => d(api.get<Data<SettlementPeriod>>("/my-settlement", { period })),
  close: (period: string) => d(api.post<Data<SettlementPeriod>>("/settlements/close", { period })),
  reopen: (period: string) => d(api.post<Data<SettlementPeriod>>("/settlements/reopen", { period })),

  rules: () => d(api.get<Data<CompensationRule[]>>("/compensation-rules")),
  addRule: (body: { doctor_id: string; specialty_id?: string | null; percent: number; effective_from: string; notes?: string | null }) =>
    d(api.post<Data<CompensationRule>>("/compensation-rules", body)),
  removeRule: (id: string) => api.delete(`/compensation-rules/${id}`),

  categories: () => d(api.get<Data<ExpenseCategory[]>>("/expense-categories")),
  addCategory: (body: { name: string; default_allocation?: Allocation }) => d(api.post<Data<ExpenseCategory>>("/expense-categories", body)),
  updateCategory: (id: string, body: Partial<ExpenseCategory>) => d(api.patch<Data<ExpenseCategory>>(`/expense-categories/${id}`, body)),

  expenses: (period: string) => api.get<{ data: Expense[]; totals: Partial<Record<Currency, number>> }>("/expenses", { period }),
  addExpense: (body: { category_id: string; amount: number; currency: Currency; spent_at?: string; allocation: Allocation; doctor_id?: string | null; specialty_id?: string | null; notes?: string | null }) =>
    d(api.post<Data<Expense>>("/expenses", body)),
  updateExpense: (id: string, body: Partial<Pick<Expense, "category_id" | "amount" | "currency" | "spent_at" | "allocation" | "doctor_id" | "specialty_id" | "notes">>) =>
    d(api.patch<Data<Expense>>(`/expenses/${id}`, body)),
  removeExpense: (id: string) => api.delete(`/expenses/${id}`),

  recurring: (period: string) => d(api.get<Data<RecurringExpense[]>>("/recurring-expenses", { period })),
  /** posts the month's fixed expenses (rent…); safe to press twice */
  generateRecurring: (period: string) => api.post<{ created: number; period: string }>("/recurring-expenses/generate", { period }),
  addRecurring: (body: { category_id: string; amount: number; currency: Currency; allocation: Allocation; doctor_id?: string | null; specialty_id?: string | null; notes?: string | null }) =>
    d(api.post<Data<RecurringExpense>>("/recurring-expenses", body)),
  updateRecurring: (id: string, body: Partial<RecurringExpense>) => d(api.patch<Data<RecurringExpense>>(`/recurring-expenses/${id}`, body)),
  removeRecurring: (id: string) => api.delete(`/recurring-expenses/${id}`),

  payouts: (params: { period?: string; doctor_id?: string } = {}) => d(api.get<Data<DoctorPayout[]>>("/payouts", params)),
  addPayout: (body: { doctor_id: string; period?: string | null; amount: number; currency: Currency; paid_at: string; notes?: string | null }) =>
    d(api.post<Data<DoctorPayout>>("/payouts", body)),
  removePayout: (id: string) => api.delete(`/payouts/${id}`),
};

export const dashboardApi = {
  get: () => d(api.get<Data<DashboardData>>("/dashboard")),
};

export const receiptsApi = {
  payment: (id: string) =>
    api.get<{ data: Payment & { patient?: { id: string; full_name: string; phone_number: string | null } | null; doctor?: { id: string; full_name: string } | null; appointment?: { id: string; scheduled_at: string; specialty?: { id: string; name_ar: string } | null } | null }; received_by: string | null; clinic: ClinicHeader }>(
      `/payments/${id}`),
};

// ---------------------------------------------------------------------------
// Helpers shared by screens
// ---------------------------------------------------------------------------

/** Local day boundaries as ISO strings (what the old screens sent to Supabase). */
export const dayStartIso = (date: string) => new Date(`${date}T00:00:00`).toISOString();
export const dayEndIso = (date: string) => new Date(`${date}T23:59:59.999`).toISOString();

/** Show a Laravel validation/permission error in a toast-friendly string. */
export function apiErrorMessage(e: unknown): string {
  if (e && typeof e === "object" && "errors" in e) {
    const errors = (e as { errors: Record<string, string[]> }).errors;
    const first = Object.values(errors ?? {})[0]?.[0];
    if (first) return first;
  }
  return e instanceof Error ? e.message : "حدث خطأ غير متوقع";
}
