import { SystemStatistics } from "@/components/SystemStatistics";
import { useUserRole } from "@/hooks/useUserRole";

// Finances of the logged-in independent doctor (their own books only).
// Row-level security also guarantees they can only read their own records/payments.
export default function MyFinances() {
  const { doctorId, isLoading } = useUserRole();

  if (isLoading) {
    return <p className="text-muted-foreground p-6">جاري التحميل...</p>;
  }

  if (!doctorId) {
    return (
      <p className="text-muted-foreground p-6">
        حسابك غير مرتبط بطبيب. يرجى التواصل مع مدير النظام.
      </p>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6" dir="rtl">
      <SystemStatistics fixedDoctorId={doctorId} title="حساباتي" />
    </div>
  );
}
