import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clinicSettingsApi, receiptsApi, type Currency } from "@/api/clinic";

const money = (amount: number, currency: Currency) =>
  `${Math.round(Number(amount) || 0).toLocaleString("en-US")} ${currency === "USD" ? "$" : "ل.س"}`;

const doctorTitle = (name: string | null | undefined) => (name ? (name.startsWith("د.") ? name : `د. ${name}`) : "—");

/**
 * A5 payment receipt (إيصال استلام). Browser printing renders Arabic
 * correctly, same approach as the prescription.
 */
export default function PrintReceipt() {
  const { paymentId } = useParams<{ paymentId: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["receipt-print", paymentId],
    queryFn: () => receiptsApi.payment(paymentId!),
    enabled: !!paymentId,
  });

  const number = (paymentId ?? "").slice(0, 8).toUpperCase();

  useEffect(() => {
    if (data) document.title = `إيصال ${number} - ${data.data.patient?.full_name ?? ""}`;
  }, [data, number]);

  if (isLoading) return <p className="p-8 text-center text-muted-foreground">جاري تحميل الإيصال...</p>;
  if (isError || !data) return <p className="p-8 text-center text-destructive">تعذر تحميل الإيصال أو ليس لديك صلاحية لعرضه</p>;

  const { data: payment, clinic, received_by } = data;
  const specialty = payment.appointment?.specialty?.name_ar;

  return (
    <div dir="rtl" className="min-h-screen bg-muted/40 print:bg-white">
      <style>{`
        @page { size: A5 portrait; margin: 0; }
        @media print {
          html, body { background: #fff !important; }
          .receipt-sheet { box-shadow: none !important; margin: 0 !important; }
        }
        .receipt-sheet { width: 148mm; min-height: 210mm; padding: 10mm 11mm 9mm; }
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

      <div className="receipt-sheet mx-auto my-6 flex flex-col bg-white text-black shadow-lg print:my-0">
        <header className="flex items-start justify-between gap-3 border-b-2 border-gray-800 pb-3">
          <div className="min-w-0 flex-1">
            {clinic.name && <h1 className="text-xl font-bold leading-tight">{clinic.name}</h1>}
            {clinic.name_en && <p className="text-xs text-gray-600" dir="ltr" style={{ textAlign: "right" }}>{clinic.name_en}</p>}
            {clinic.address && <p className="mt-1 text-xs text-gray-700">{clinic.address}</p>}
            {clinic.phone && <p className="text-xs text-gray-700">هاتف: <bdi dir="ltr">{clinic.phone}</bdi></p>}
          </div>
          {clinic.has_logo && <img src={clinicSettingsApi.logoUrl()} alt="" className="h-16 w-16 shrink-0 object-contain" />}
        </header>

        <div className="mt-4 flex items-end justify-between">
          <h2 className="text-2xl font-bold">إيصال استلام</h2>
          <div className="text-left text-sm" style={{ textAlign: "left" }}>
            <p>رقم: <bdi dir="ltr" className="font-mono font-semibold">{number}</bdi></p>
            <p>التاريخ: <bdi dir="ltr">{format(new Date(payment.paid_at), "yyyy/MM/dd HH:mm")}</bdi></p>
          </div>
        </div>

        <section className="mt-6 flex-1 space-y-4 text-base leading-relaxed">
          <p>
            <span className="text-gray-600">استلمنا من السيد/ة: </span>
            <span className="font-semibold">{payment.patient?.full_name ?? "—"}</span>
          </p>
          <p>
            <span className="text-gray-600">مبلغ وقدره: </span>
            <span className="rounded border border-gray-700 px-3 py-1 text-lg font-bold">
              <bdi dir="ltr">{money(payment.amount, payment.currency)}</bdi>
            </span>
          </p>
          <p>
            <span className="text-gray-600">وذلك عن: </span>
            معالجة لدى {doctorTitle(payment.doctor?.full_name)}
            {specialty ? ` — ${specialty}` : ""}
          </p>
          {payment.appointment?.scheduled_at && (
            <p>
              <span className="text-gray-600">تاريخ الموعد: </span>
              <bdi dir="ltr">{format(new Date(payment.appointment.scheduled_at), "yyyy/MM/dd HH:mm")}</bdi>
            </p>
          )}
          {payment.notes && (
            <p className="text-sm"><span className="text-gray-600">ملاحظات: </span>{payment.notes}</p>
          )}
        </section>

        <footer className="mt-8">
          <div className="flex items-end justify-between gap-4 text-sm">
            <p><span className="text-gray-600">المستلم: </span>{received_by ?? "—"}</p>
            <div className="w-44 text-center">
              <div className="h-10 border-b border-gray-700" />
              <p className="mt-1">التوقيع</p>
            </div>
          </div>
          {clinic.footer && <p className="mt-4 border-t border-gray-300 pt-2 text-center text-xs text-gray-600">{clinic.footer}</p>}
        </footer>
      </div>
    </div>
  );
}
