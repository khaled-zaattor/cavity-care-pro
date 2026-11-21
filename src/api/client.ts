// HTTP client for the Laravel API (Sanctum SPA cookie auth).
//
// The API lives on the same domain under /api:
//   production: https://your-domain/api/...   (Laravel's public/ mounted at /api)
//   local dev : Vite proxies /api -> http://127.0.0.1:8000 (see vite.config.ts)
//
// Pages must not call fetch() directly; add a function in src/api/* instead.

export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

/** true once the frontend should talk to Laravel instead of Supabase. */
export const USE_LARAVEL = import.meta.env.VITE_BACKEND === "laravel";

export class ApiError extends Error {
  status: number;
  /** Laravel validation errors: { field: ["message", ...] } */
  errors: Record<string, string[]>;

  constructor(status: number, message: string, errors: Record<string, string[]> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp("(^|;\\s*)" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[2]) : null;
}

let csrfReady: Promise<void> | null = null;

/** Sanctum sets the XSRF-TOKEN cookie; must be called once before the first write. */
export function ensureCsrfCookie(force = false): Promise<void> {
  if (!csrfReady || force) {
    csrfReady = fetch(`${API_BASE}/sanctum/csrf-cookie`, { credentials: "include" }).then((res) => {
      if (!res.ok) throw new ApiError(res.status, "تعذر الاتصال بالخادم");
    });
  }
  return csrfReady;
}

type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}, retried = false): Promise<T> {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  for (const [key, value] of Object.entries(opts.query ?? {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }

  const isWrite = method !== "GET";
  if (isWrite) await ensureCsrfCookie();

  const isForm = opts.body instanceof FormData;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
  };
  if (opts.body !== undefined && !isForm) headers["Content-Type"] = "application/json";
  const xsrf = readCookie("XSRF-TOKEN");
  if (xsrf) headers["X-XSRF-TOKEN"] = xsrf;

  const res = await fetch(url.toString(), {
    method,
    credentials: "include",
    headers,
    signal: opts.signal,
    body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
  });

  // 419 = CSRF token expired: refresh it once and retry.
  if (res.status === 419 && !retried) {
    await ensureCsrfCookie(true);
    return request<T>(method, path, opts, true);
  }

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  // Session expired while using the app: AuthWrapper shows the login screen.
  if (res.status === 401 && !path.startsWith("/auth/")) {
    window.dispatchEvent(new Event("auth:expired"));
  }
  if (!res.ok) {
    const message =
      (data && typeof data.message === "string" && data.message) ||
      (res.status === 401 ? "انتهت الجلسة، يرجى تسجيل الدخول" : res.status === 403 ? "ليس لديك صلاحية" : "حدث خطأ في الخادم");
    throw new ApiError(res.status, message, data?.errors ?? {});
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>("GET", path, { query, signal }),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, { body }),
  delete: <T = void>(path: string) => request<T>("DELETE", path),
};
