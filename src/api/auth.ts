import { api, ensureCsrfCookie } from "./client";

export type AppRole = "super_admin" | "doctor" | "dentist_assistant" | "receptionist";

export interface CurrentUser {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole | null;
  doctor_id: string | null;
  has_own_books: boolean;
  is_independent_doctor: boolean;
}

export async function login(email: string, password: string): Promise<CurrentUser> {
  await ensureCsrfCookie(true);
  const res = await api.post<{ user: CurrentUser }>("/auth/login", { email, password });
  return res.user;
}

export async function logout(): Promise<void> {
  await api.post("/auth/logout");
}

/** Returns null when not logged in. */
export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  try {
    const res = await api.get<{ user: CurrentUser }>("/auth/me");
    return res.user;
  } catch (e) {
    if (e instanceof Error && "status" in e && (e as { status: number }).status === 401) return null;
    throw e;
  }
}
