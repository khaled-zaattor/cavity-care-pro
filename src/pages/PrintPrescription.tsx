import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { differenceInMonths, differenceInYears, format } from "date-fns";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clinicSettingsApi, prescriptionsApi } from "@/api/clinic";

/** "7 سنوات" / "8 أشهر" from a date of birth. */
function age(dob: string | null | undefined): string | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime()) || birth.getFullYear() < 1900) return null;
  const years = differenceInYears(new Date(), birth);
  if (years >= 1) return `${years} ${years >= 3 && years <= 10 ? "سنوات" : "سنة"}`;
  const months = differenceInMonths(new Date(), birth);
  if (months < 0) return null;
  if (months === 0) return "أقل من شهر";
  return `${months} ${months >= 3 && months <= 10 ? "أشهر" : "شهر"}`;
}

/** Latin medicine names inside Arabic text: keep them left-to-right. */
const Ltr = ({ children }: { children: React.ReactNode }) => <bdi dir="auto">{children}</bdi>;

/**
 * A4 prescription (plan §2.3): clinic header + the doctor's own header,
 * patient, medicines, signature. Browser printing renders Arabic correctly
 * (server-side PDF libraries do not).
 */
export default function PrintPrescription() {
  const { prescriptionId } = useParams<{ prescriptionId: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["prescription-print", prescriptionId],
    queryFn: () => prescriptionsApi.get(prescriptionId!),
    enabled: !!prescriptionId,
  });

  // Remember that it was printed (badge in the patient profile).
  useEffect(() => {
    if (!prescriptionId) return;
    const after = () => prescriptionsApi.markPrinted(prescriptionId).catch(() => {});
    window.addEventListener("afterprint", after);
    return () => window.removeEventListener("afterprint", after);
  }, [prescriptionId]);

  useEffect(() => {
    if (data) document.title = `وصفة ${data.data.number} - ${data.data.patient?.full_name ?? ""}`;
  }, [data]);

  if (isLoading) return <p className="p-8 text-center text-muted-foreground">جاري تحميل الوصفة...</p>;
  if (isError || !data) return <p className="p-8 text-center text-destructive">تعذر تحميل الوصفة أو ليس لديك صلاحية لعرضها</p>;

  const { data: rx, clinic } = data;
  const patientAge = age(rx.patient?.date_of_birth);
  const headerLines = (rx.doctor?.print_header ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const doctorName = rx.doctor?.full_name ? (rx.doctor.full_name.startsWith("د.") ? rx.doctor.full_name : `د. ${rx.doctor.full_name}`) : "";

  return (
    <div dir="rtl" className="min-h-screen bg-muted/40 print:bg-white">
      <style>{`
        @page { size: A4; margin: 0; }
        @media print {
          html, body { background: #fff !important; }
          .rx-sheet { box-shadow: none !important; margin: 0 !important; }
        }
        .rx-sheet { width: 210mm; min-height: 297mm; padding: 14mm 16mm 12mm; }
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
        {rx.printed_at && <span className="text-xs text-muted-foreground">طُبعت سابقاً</span>}
      </div>

      <div className="rx-sheet mx-auto my-6 flex flex-col bg-white text-black shadow-lg print:my-0">
        {/* Header: clinic (start) — logo — doctor (end) */}
        <header className="flex items-start justify-between gap-4 border-b-2 border-gray-800 pb-4">
          <div className="min-w-0 flex-1">
            {clinic.name && <h1 className="text-2xl font-bold leading-tight">{clinic.name}</h1>}
            {clinic.name_en && <p className="text-sm text-gray-600" dir="ltr" style={{ textAlign: "right" }}>{clinic.name_en}</p>}
            {clinic.address && <p className="mt-1 text-sm text-gray-700">{clinic.address}</p>}
            {clinic.phone && <p className="text-sm text-gray-700">هاتف: <bdi dir="ltr">{clinic.phone}</bdi></p>}
          </div>
          {clinic.has_logo && (
            <img src={clinicSettingsApi.logoUrl()} alt="" className="h-20 w-20 shrink-0 object-contain" />
          )}
          <div className="min-w-0 flex-1 text-left" style={{ textAlign: "left" }}>
            <p className="text-xl font-bold">{doctorName}</p>
            {rx.specialty?.name_ar && <p className="text-sm text-gray-700">{rx.specialty.name_ar}</p>}
            {headerLines.map((l, i) => (
              <p key={i} className="text-xs text-gray-600">{l}</p>
            ))}
          </div>
        </header>

        {/* Patient / date / number */}
        <section className="mt-4 grid grid-cols-3 gap-2 rounded border border-gray-300 px-3 py-2 text-sm">
          <p><span className="text-gray-600">المريض: </span><span className="font-semibold">{rx.patient?.full_name}</span></p>
          <p className="text-center"><span className="text-gray-600">العمر: </span>{patientAge ?? "—"}</p>
          <p className="text-left" style={{ textAlign: "left" }}>
            <span className="text-gray-600">التاريخ: </span>
            <bdi dir="ltr">{format(new Date(rx.issued_at), "yyyy/MM/dd")}</bdi>
          </p>
        </section>

        {rx.diagnosis && (
          <p className="mt-3 text-sm"><span className="text-gray-600">التشخيص: </span>{rx.diagnosis}</p>
        )}

        {/* Medicines */}
        <section className="mt-5 flex-1">
          <p className="mb-3 text-3xl font-serif leading-none" dir="ltr" style={{ textAlign: "left" }}>℞</p>
          <ol className="space-y-4">
            {rx.items.map((item, i) => (
              <li key={item.id} className="flex gap-3">
                <span className="w-6 shrink-0 text-lg font-bold">{i + 1}.</span>
                <div className="min-w-0">
                  <p className="text-lg font-bold"><Ltr>{item.medicine_name}</Ltr></p>
                  {[item.dose, item.frequency, item.duration].some(Boolean) && (
                    <p className="text-base">{[item.dose, item.frequency, item.duration].filter(Boolean).join(" — ")}</p>
                  )}
                  {item.instructions && <p className="text-sm text-gray-700">{item.instructions}</p>}
                  {item.quantity && <p className="text-sm text-gray-700">الكمية: {item.quantity}</p>}
                </div>
              </li>
            ))}
          </ol>

          {rx.notes && (
            <div className="mt-6 rounded border border-dashed border-gray-400 p-3 text-sm">
              <span className="font-semibold">ملاحظات: </span>
              {rx.notes}
            </div>
          )}
        </section>

        {/* Footer */}
        <footer className="mt-8">
          <div className="flex items-end justify-between">
            <p className="text-xs text-gray-500">
              رقم الوصفة: <bdi dir="ltr">{rx.number}</bdi>
            </p>
            <div className="w-56 text-center">
              <div className="h-12 border-b border-gray-700" />
              <p className="mt-1 text-sm">توقيع الطبيب</p>
            </div>
          </div>
          {clinic.footer && <p className="mt-4 border-t border-gray-300 pt-2 text-center text-xs text-gray-600">{clinic.footer}</p>}
        </footer>
      </div>
    </div>
  );
}
