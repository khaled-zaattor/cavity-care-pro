import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Calendar, FileText, DollarSign, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { dayEndIso, dayStartIso, doctorsApi, reportsApi } from "@/api/clinic";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface SystemStatisticsProps {
  /** Lock the statistics to one doctor's books (used by "My Finances"). Hides the books filter. */
  fixedDoctorId?: string;
  title?: string;
}

export function SystemStatistics({ fixedDoctorId, title }: SystemStatisticsProps = {}) {
  const currentDate = new Date();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const [startDate, setStartDate] = useState(format(firstDayOfMonth, 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(currentDate, 'yyyy-MM-dd'));
  // Books filter: "all" | "clinic" | <independent doctor id>
  const [books, setBooks] = useState<string>("all");

  const { data: doctors } = useQuery({
    queryKey: ["doctors"],
    enabled: !fixedDoctorId,
    queryFn: () => doctorsApi.list(),
  });

  const independentDoctors = doctors?.filter((d) => d.has_own_books) ?? [];
  // An independent doctor's books are enforced by the server whatever we send.
  const booksParam = fixedDoctorId ?? books;

  // Sums are computed by the server in SQL (the old client-side sums stopped at 1000 rows).
  const { data: raw, isLoading } = useQuery({
    queryKey: ["system-stats", startDate, endDate, booksParam],
    queryFn: () => reportsApi.stats(dayStartIso(startDate), dayEndIso(endDate), booksParam),
  });

  const stats = raw && {
    patientsCount: raw.new_patients_count ?? 0,
    appointmentsCount: raw.appointments_count,
    treatmentsCount: raw.treatments_count,
    treatmentCostSyp: raw.treatment_cost_syp,
    treatmentCostUsd: raw.treatment_cost_usd,
    totalPaymentsSyp: raw.total_payments_syp,
    totalPaymentsUsd: raw.total_payments_usd,
    totalRevenueSyp: raw.revenue_syp,
    totalRevenueUsd: raw.revenue_usd,
  };

  // Patients are shared by all doctors, so "new patients" only makes sense for the whole clinic
  const showPatients = !fixedDoctorId && books === "all";

  const statCards = [
    ...(showPatients
      ? [{
          title: "المرضى الجدد",
          value: stats?.patientsCount?.toString() || "0",
          icon: Users,
          color: "text-blue-600",
        }]
      : []),
    {
      title: "المواعيد",
      value: stats?.appointmentsCount?.toString() || "0",
      icon: Calendar,
      color: "text-green-600",
    },
    {
      title: "العلاجات المنفذة",
      value: stats?.treatmentsCount?.toString() || "0",
      icon: FileText,
      color: "text-purple-600",
    },
    {
      title: "كلفة العلاجات (ل.س)",
      value: `${Math.round(stats?.treatmentCostSyp || 0).toLocaleString('en-US')} ل.س`,
      icon: TrendingUp,
      color: "text-orange-600",
    },
    {
      title: "كلفة العلاجات ($)",
      value: `$${Math.round(stats?.treatmentCostUsd || 0).toLocaleString('en-US')}`,
      icon: TrendingUp,
      color: "text-orange-600",
    },
    {
      title: "المدفوعات (ل.س)",
      value: `${Math.round(stats?.totalPaymentsSyp || 0).toLocaleString('en-US')} ل.س`,
      icon: DollarSign,
      color: "text-emerald-600",
    },
    {
      title: "المدفوعات ($)",
      value: `$${Math.round(stats?.totalPaymentsUsd || 0).toLocaleString('en-US')}`,
      icon: DollarSign,
      color: "text-emerald-600",
    },
    {
      title: "الإيرادات (ل.س)",
      value: `${Math.round(stats?.totalRevenueSyp || 0).toLocaleString('en-US')} ل.س`,
      icon: DollarSign,
      color: stats?.totalRevenueSyp && stats.totalRevenueSyp < 0 ? "text-red-600" : "text-emerald-600",
    },
    {
      title: "الإيرادات ($)",
      value: `$${Math.round(stats?.totalRevenueUsd || 0).toLocaleString('en-US')}`,
      icon: DollarSign,
      color: stats?.totalRevenueUsd && stats.totalRevenueUsd < 0 ? "text-red-600" : "text-emerald-600",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-2xl font-bold">{title ?? "إحصائيات النظام"}</h2>
          <p className="text-muted-foreground">عرض الإحصائيات حسب الفترة الزمنية</p>
        </div>
        <div className="flex flex-col md:flex-row gap-4 md:items-end">
          {!fixedDoctorId && (
            <div className="flex-1">
              <Label>الحسابات</Label>
              <Select value={books} onValueChange={setBooks}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="clinic">حسابات العيادة</SelectItem>
                  {independentDoctors.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      حسابات د. {d.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex-1">
            <Label htmlFor="start-date">من تاريخ</Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              max={endDate}
            />
          </div>
          <div className="flex-1">
            <Label htmlFor="end-date">إلى تاريخ</Label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate}
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground">جاري تحميل الإحصائيات...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {statCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
