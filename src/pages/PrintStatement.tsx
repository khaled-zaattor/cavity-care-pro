import { useEffect, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clinicSettingsApi, patientsApi } from "@/api/clinic";

type Row = {
  key: string;
  at: Date;
  kind: "charge" | "payment";
  description: string;
  doctor: string | null;
  syp: number;
  usd: number;
};

const num = (v: number | null | undefined) => Number(v) || 0;
const fmt = (v: number) => (v === 0 ? "" : Math.round(v).toLocaleString("en-US"));
const fmtSigned = (v: number) => Math.round(v).toLocaleString("en-US");
const dayKey = (d: Date) => format(d, "yyyy-MM-dd");
const isDay = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/**
 * A4 patient account statement (كشف حساب): treatment charges and payments in
 * one chronological table with a running balance per currency, then the
 * overall balance. Optional ?from=YYYY-MM-DD&to=YYYY-MM-DD limits the rows.
 */
export default function PrintStatement() {
  const { patientId } = useParams<{ patientId: string }>();
  const [params] = useSearchParams();
  const from = isDay(params.get("from"));
  const to = isDay(params.get("to"));
  const enabled = !!patientId;

  const patientQ = useQuery({ queryKey: ["statement-patient", patientId], queryFn: () => patientsApi.get(patientId!), enabled });
  const recordsQ = useQuery({ queryKey: ["statement-records", patientId], queryFn: () => patientsApi.treatmentRecords(patientId!), enabled });
  const paymentsQ = useQuery({ queryKey: ["statement-payments", patientId], queryFn: () => patientsApi.payments(patientId!), enabled });
  const balanceQ = useQuery({ queryKey: ["statement-balance", patientId], queryFn: () => patientsApi.balance(patientId!), enabled });
  const clinicQ = useQuery({ queryKey: ["clinic-settings"], queryFn: () => clinicSettingsApi.get(), retry: false });

  const patient = patientQ.data;
  const balance = balanceQ.data;
  const clinic = clinicQ.data;

  const { opening, rows } = useMemo(() => {
    const all: Row[] = [
      ...(recordsQ.data ?? []).map((r): Row => {
        const parts = [r.treatment?.name, r.sub_treatment?.name].filter(Boolean).join(" — ");
        return {
          key: `r-${r.id}`,
          at: new Date(r.performed_at || r.created_at),
          kind: "charge",
          description: `${parts || "علاج"}${r.tooth_number ? ` (السن ${r.tooth_number})` : ""}`,
          doctor: r.appointment?.doctor?.full_name ?? null,
          syp: num(r.actual_cost_syp),
          usd: num(r.actual_cost_usd),
        };
      }),
      ...(paymentsQ.data ?? []).map((p): Row => ({
        key: `p-${p.id}`,
        at: new Date(p.paid_at),
        kind: "payment",
        description: `دفعة${p.notes ? ` — ${p.notes}` : ""}`,
        doctor: p.appointment?.doctor?.full_name ?? null,
        syp: p.currency === "SYP" ? num(p.amount) : 0,
        usd: p.currency === "USD" ? num(p.amount) : 0,
      })),
    ].sort((a, b) => a.at.getTime() - b.at.getTime() || (a.kind === b.kind ? 0 : a.kind === "charge" ? -1 : 1));

    let syp = 0;
    let usd = 0;
    const open = { syp: 0, usd: 0 };
    const out: (Row & { balSyp: number; balUsd: number })[] = [];
    for (const r of all) {
      const sign = r.kind === "charge" ? 1 : -1;
      syp += sign * r.syp;
      usd += sign * r.usd;
      const day = dayKey(r.at);
      if (from && day < from) {
        open.syp = syp;
        open.usd = usd;
        continue;
      }
      if (to && day > to) continue;
      out.push({ ...r, balSyp: syp, balUsd: usd });
    }
    return { opening: open, rows: out };
  }, [recordsQ.data, paymentsQ.data, from, to]);

  useEffect(() => {
    if (patient) document.title = `كشف حساب - ${patient.full_name}`;
  }, [patient]);

  const loading = patientQ.isLoading || recordsQ.isLoading || paymentsQ.isLoading || balanceQ.isLoading;
  const failed = patientQ.isError || recordsQ.isError || paymentsQ.isError || balanceQ.isError;

  if (loading) return <p className="p-8 text-center text-muted-foreground">جاري تحميل كشف الحساب...</p>;
  if (failed || !patient) return <p className="p-8 text-center text-destructive">تعذر تحميل كشف الحساب أو ليس لديك صلاحية لعرضه</p>;

  const showOpening = !!from && (opening.syp !== 0 || opening.usd !== 0);
  const bySpecialty = balance?.by_specialty ?? [];

  return (
    <div dir="rtl" className="min-h-screen bg-muted/40 print:bg-white">
      <style>{`
        @page { size: A4; margin: 0; }
        @media print {
          html, body { background: #fff !important; }
          .st-sheet { box-shadow: none !important; margin: 0 !important; }
          .st-table thead { display: table-header-group; }
          .st-table tr { break-inside: avoid; }
        }
        .st-sheet { width: 210mm; min-height: 297mm; padding: 14mm 14mm 12mm; }
        .st-table th, .st-table td { border: 1px solid #9ca3af; padding: 3px 5px; }
      `}</style>

      {/* Screen-only toolbar */}
      <div className="print:hidden sticky top-0 z-10 flex items-center justify-center gap-2 border-b bg-background/95 p-3 backdrop-blur">
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4 ms-2" />
          طباعة
        </Button>
        <Button variant="outline" onClick={() => window.close()}>
          <X className="h-4 w-4 ms-2" />
          إغلاق
        </Button>
      </div>

      <div className="st-sheet mx-auto my-6 flex flex-col bg-white text-black shadow-lg print:my-0">
        <header className="flex items-start justify-between gap-4 border-b-2 border-gray-800 pb-4">
          <div className="min-w-0 flex-1">
            {clinic?.clinic_name && <h1 className="text-2xl font-bold leading-tight">{clinic.clinic_name}</h1>}
            {clinic?.clinic_name_en && <p className="text-sm text-gray-600" dir="ltr" style={{ textAlign: "right" }}>{clinic.clinic_name_en}</p>}
            {clinic?.clinic_address && <p className="mt-1 text-sm text-gray-700">{clinic.clinic_address}</p>}
            {clinic?.clinic_phone && <p className="text-sm text-gray-700">هاتف: <bdi dir="ltr">{clinic.clinic_phone}</bdi></p>}
          </div>
          {clinic?.has_logo && <img src={clinicSettingsApi.logoUrl()} alt="" className="h-20 w-20 shrink-0 object-contain" />}
          <div className="min-w-0 flex-1" style={{ textAlign: "left" }}>
            <p className="text-xl font-bold">كشف حساب مريض</p>
            <p className="text-sm text-gray-700">تاريخ الكشف: <bdi dir="ltr">{format(new Date(), "yyyy/MM/dd")}</bdi></p>
            {(from || to) && (
              <p className="text-xs text-gray-600">
                الفترة: <bdi dir="ltr">{from ?? "…"}</bdi> — <bdi dir="ltr">{to ?? "…"}</bdi>
              </p>
            )}
          </div>
        </header>

        <section className="mt-4 grid grid-cols-2 gap-2 rounded border border-gray-300 px-3 py-2 text-sm">
          <p><span className="text-gray-600">المريض: </span><span className="font-semibold">{patient.full_name}</span></p>
          <p style={{ textAlign: "left" }}>
            <span className="text-gray-600">الهاتف: </span>
            <bdi dir="ltr">{patient.phone_number || "—"}</bdi>
          </p>
        </section>

        <section className="mt-4 flex-1">
          <table className="st-table w-full border-collapse text-xs">
            <thead className="bg-gray-100">
              <tr>
                <th rowSpan={2}>التاريخ</th>
                <th rowSpan={2}>البيان</th>
                <th rowSpan={2}>الطبيب</th>
                <th colSpan={2}>مدين (علاج)</th>
                <th colSpan={2}>دائن (دفعة)</th>
                <th colSpan={2}>الرصيد</th>
              </tr>
              <tr>
                <th>ل.س</th><th>$</th>
                <th>ل.س</th><th>$</th>
                <th>ل.س</th><th>$</th>
              </tr>
            </thead>
            <tbody>
              {showOpening && (
                <tr className="bg-gray-50 font-semibold">
                  <td><bdi dir="ltr">{from}</bdi></td>
                  <td colSpan={6}>رصيد سابق</td>
                  <td className="text-left"><bdi dir="ltr">{fmtSigned(opening.syp)}</bdi></td>
                  <td className="text-left"><bdi dir="ltr">{fmtSigned(opening.usd)}</bdi></td>
                </tr>
              )}
              {rows.length === 0 && (
                <tr><td colSpan={9} className="py-4 text-center text-gray-500">لا توجد حركات</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="whitespace-nowrap"><bdi dir="ltr">{format(r.at, "yyyy/MM/dd")}</bdi></td>
                  <td>{r.description}</td>
                  <td>{r.doctor ?? "—"}</td>
                  <td className="text-left"><bdi dir="ltr">{r.kind === "charge" ? fmt(r.syp) : ""}</bdi></td>
                  <td className="text-left"><bdi dir="ltr">{r.kind === "charge" ? fmt(r.usd) : ""}</bdi></td>
                  <td className="text-left"><bdi dir="ltr">{r.kind === "payment" ? fmt(r.syp) : ""}</bdi></td>
                  <td className="text-left"><bdi dir="ltr">{r.kind === "payment" ? fmt(r.usd) : ""}</bdi></td>
                  <td className="text-left font-semibold"><bdi dir="ltr">{fmtSigned(r.balSyp)}</bdi></td>
                  <td className="text-left font-semibold"><bdi dir="ltr">{fmtSigned(r.balUsd)}</bdi></td>
                </tr>
              ))}
            </tbody>
          </table>

          {balance && (
            <div className="mt-6 grid grid-cols-2 gap-4 text-sm" style={{ breakInside: "avoid" }}>
              <table className="st-table w-full border-collapse">
                <thead className="bg-gray-100">
                  <tr><th>الإجمالي</th><th>ل.س</th><th>$</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td>إجمالي تكلفة العلاجات</td>
                    <td className="text-left"><bdi dir="ltr">{fmtSigned(balance.total_cost_syp)}</bdi></td>
                    <td className="text-left"><bdi dir="ltr">{fmtSigned(balance.total_cost_usd)}</bdi></td>
                  </tr>
                  <tr>
                    <td>إجمالي المدفوعات</td>
                    <td className="text-left"><bdi dir="ltr">{fmtSigned(balance.total_paid_syp)}</bdi></td>
                    <td className="text-left"><bdi dir="ltr">{fmtSigned(balance.total_paid_usd)}</bdi></td>
                  </tr>
                  <tr className="font-bold">
                    <td>الرصيد المستحق</td>
                    <td className="text-left"><bdi dir="ltr">{fmtSigned(balance.syp)}</bdi></td>
                    <td className="text-left"><bdi dir="ltr">{fmtSigned(balance.usd)}</bdi></td>
                  </tr>
                </tbody>
              </table>

              {bySpecialty.length > 1 && (
                <table className="st-table w-full border-collapse">
                  <thead className="bg-gray-100">
                    <tr><th>حسب التخصص</th><th>ل.س</th><th>$</th></tr>
                  </thead>
                  <tbody>
                    {bySpecialty.map((s) => (
                      <tr key={s.specialty_id ?? s.name}>
                        <td>{s.name}</td>
                        <td className="text-left"><bdi dir="ltr">{fmtSigned(s.syp)}</bdi></td>
                        <td className="text-left"><bdi dir="ltr">{fmtSigned(s.usd)}</bdi></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
          <p className="mt-2 text-xs text-gray-500">الرصيد الموجب = مبلغ مستحق على المريض، السالب = رصيد زائد له.</p>
        </section>

        <footer className="mt-8">
          {clinic?.prescription_footer && (
            <p className="border-t border-gray-300 pt-2 text-center text-xs text-gray-600">{clinic.prescription_footer}</p>
          )}
        </footer>
      </div>
    </div>
  );
}
