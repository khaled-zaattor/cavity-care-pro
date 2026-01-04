import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Calendar, FileText, DollarSign, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { format } from "date-fns";

export function SystemStatistics() {
  const currentDate = new Date();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const [startDate, setStartDate] = useState(format(firstDayOfMonth, 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(currentDate, 'yyyy-MM-dd'));

  const { data: stats, isLoading } = useQuery({
    queryKey: ["system-stats", startDate, endDate],
    queryFn: async () => {
      const startDateTime = new Date(startDate);
      startDateTime.setHours(0, 0, 0, 0);
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);

      const [patients, appointments, treatments, treatmentRecords, payments] = await Promise.all([
        supabase
          .from("patients")
          .select("id", { count: "exact" })
          .gte("created_at", startDateTime.toISOString())
          .lte("created_at", endDateTime.toISOString()),
        supabase
          .from("appointments")
          .select("id", { count: "exact" })
          .gte("scheduled_at", startDateTime.toISOString())
          .lte("scheduled_at", endDateTime.toISOString()),
        supabase
          .from("treatment_records")
          .select("id", { count: "exact" })
          .gte("performed_at", startDateTime.toISOString())
          .lte("performed_at", endDateTime.toISOString()),
        supabase
          .from("treatment_records")
          .select("actual_cost_syp, actual_cost_usd")
          .gte("performed_at", startDateTime.toISOString())
          .lte("performed_at", endDateTime.toISOString()),
        supabase
          .from("payments")
          .select("amount, currency")
          .gte("paid_at", startDateTime.toISOString())
          .lte("paid_at", endDateTime.toISOString()),
      ]);

      const totalTreatmentCostSyp = treatmentRecords.data?.reduce(
        (sum, record) => sum + Number(record.actual_cost_syp || 0), 
        0
      ) || 0;
      const totalTreatmentCostUsd = treatmentRecords.data?.reduce(
        (sum, record) => sum + Number(record.actual_cost_usd || 0), 
        0
      ) || 0;

      const totalPaymentsSyp = payments.data?.filter(p => p.currency === 'SYP' || !p.currency).reduce(
        (sum, payment) => sum + Number(payment.amount), 
        0
      ) || 0;
      const totalPaymentsUsd = payments.data?.filter(p => p.currency === 'USD').reduce(
        (sum, payment) => sum + Number(payment.amount), 
        0
      ) || 0;

      return {
        patientsCount: patients.count || 0,
        appointmentsCount: appointments.count || 0,
        treatmentsCount: treatments.count || 0,
        treatmentCostSyp: totalTreatmentCostSyp,
        treatmentCostUsd: totalTreatmentCostUsd,
        totalPaymentsSyp: totalPaymentsSyp,
        totalPaymentsUsd: totalPaymentsUsd,
        totalRevenueSyp: totalPaymentsSyp - totalTreatmentCostSyp,
        totalRevenueUsd: totalPaymentsUsd - totalTreatmentCostUsd,
      };
    },
  });


  const statCards = [
    {
      title: "المرضى الجدد",
      value: stats?.patientsCount?.toString() || "0",
      icon: Users,
      color: "text-blue-600",
    },
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
          <h2 className="text-2xl font-bold">إحصائيات النظام</h2>
          <p className="text-muted-foreground">عرض الإحصائيات حسب الفترة الزمنية</p>
        </div>
        <div className="flex gap-4 items-end">
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
