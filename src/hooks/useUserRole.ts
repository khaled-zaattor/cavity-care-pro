import { useAuth } from "@/components/AuthWrapper";

export type AppRole = "super_admin" | "doctor" | "dentist_assistant" | "receptionist";

/**
 * Role info of the logged-in user. Same return shape as the Supabase version,
 * but read from the session loaded once by AuthWrapper (GET /auth/me) instead
 * of two queries on every page.
 */
export function useUserRole() {
  const { user, loading } = useAuth();

  const userRole = (user?.role ?? null) as AppRole | null;
  const hasOwnBooks = !!user?.has_own_books;
  const specialties = user?.specialties ?? [];
  // a doctor whose specialties are all non-dental (e.g. طب نسائي): no teeth, no dental plans
  const isNonDentalDoctor = userRole === "doctor" && specialties.length > 0 && specialties.every((s) => !s.is_dental);
  const isDentalOnlyDoctor = userRole === "doctor" && specialties.length > 0 && specialties.every((s) => s.is_dental);

  return {
    userRole,
    isLoading: loading,
    canManagePayments: userRole !== "dentist_assistant",
    doctorId: user?.doctor_id ?? null,
    hasOwnBooks,
    isIndependentDoctor: userRole === "doctor" && hasOwnBooks,
    isSuperAdmin: userRole === "super_admin",
    specialties,
    isNonDentalDoctor,
    isDentalOnlyDoctor,
  };
}
