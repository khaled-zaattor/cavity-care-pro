import { format } from "date-fns";

/** dd/MM/yyyy for an ISO date, or "-" when missing. */
export const fmtDate = (value: string | null | undefined, pattern = 'dd/MM/yyyy') =>
  value ? format(new Date(value), pattern) : '-';
