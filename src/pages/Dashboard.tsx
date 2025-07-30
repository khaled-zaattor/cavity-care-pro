import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Calendar, FileText, DollarSign } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [patients, appointments, treatments, payments] = await Promise.all([
        supabase.from("patients").select("id", { count: "exact" }),
        supabase.from("appointments").select("id", { count: "exact" }),
        supabase.from("treatments").select("id", { count: "exact" }),
        supabase.from("payments").select("amount"),
      ]);

      const totalPayments = payments.data?.reduce((sum, payment) => sum + Number(payment.amount), 0) || 0;

      return {
        patientsCount: patients.count || 0,
        appointmentsCount: appointments.count || 0,
        treatmentsCount: treatments.count || 0,
        totalRevenue: totalPayments,
      };
    },
  });

  const statCards = [
    {
      title: "Total Patients",
      value: stats?.patientsCount?.toString() || "0",
      icon: Users,
      color: "text-blue-600",
    },
    {
      title: "Appointments",
      value: stats?.appointmentsCount?.toString() || "0",
      icon: Calendar,
      color: "text-green-600",
    },
    {
      title: "Treatments",
      value: stats?.treatmentsCount?.toString() || "0",
      icon: FileText,
      color: "text-purple-600",
    },
    {
      title: "Revenue",
      value: `$${stats?.totalRevenue?.toFixed(2) || "0.00"}`,
      icon: DollarSign,
      color: "text-emerald-600",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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

      <Card>
        <CardHeader>
          <CardTitle>Welcome to Dental Clinic Management</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Manage your dental clinic efficiently with patient records, appointments, treatments, and billing.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}