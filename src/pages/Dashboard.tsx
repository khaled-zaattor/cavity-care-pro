import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Activity,
  AlertCircle,
  BarChart3,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  Clock,
  DoorOpen,
  Landmark,
  LayoutDashboard,
  ListChecks,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dashboardApi, type RevenueRow } from "@/api/clinic";

const fmt = (n: number | null | undefined) => Math.round(n ?? 0).toLocaleString("en-US");
const fmtUsd = (n: number | null | undefined) => (n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

function StatCard({ label, value, icon, hint }: { label: string; value: ReactNode; icon: ReactNode; hint?: ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg text-primary shrink-0">{icon}</div>
        <div className="min-w-0">
          <div className="text-xs sm:text-sm text-muted-foreground truncate">{label}</div>
          <div className="text-xl sm:text-2xl font-bold" dir="ltr" style={{ textAlign: "right" }}>
            {value}
          </div>
          {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function SectionTitle({ icon, children, action }: { icon: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <h2 className="text-lg sm:text-xl font-semibold flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        {children}
      </h2>
      {action}
    </div>
  );
}

function RevenueTable({ rows, nameKey, nameLabel }: { rows: RevenueRow[]; nameKey: "specialty_name" | "doctor_name"; nameLabel: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground py-4 text-center">لا توجد بيانات لهذا الشهر</p>;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-right">{nameLabel}</TableHead>
            <TableHead className="text-right">محصّل ل.س</TableHead>
            <TableHead className="text-right">محصّل $</TableHead>
            <TableHead className="text-right">العلاجات</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={(nameKey === "doctor_name" ? r.doctor_id : r.specialty_id) ?? `row-${i}`}>
              <TableCell className="font-medium">{r[nameKey] ?? "-"}</TableCell>
              <TableCell>{fmt(r.collected_syp)}</TableCell>
              <TableCell>{fmtUsd(r.collected_usd)}</TableCell>
              <TableCell>{r.treatments}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Skeleton className="h-64 rounded-lg lg:col-span-2" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    </div>
  );
}

/** لوحة التحكم: one page, contents by role (plan §4.5). */
export default function Dashboard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard"],
    queryFn: dashboardApi.get,
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-4 lg:space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <LayoutDashboard className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold">لوحة التحكم</h1>
          <p className="text-sm text-muted-foreground">{format(new Date(), "yyyy-MM-dd")}</p>
        </div>
      </div>

      {isLoading ? (
        <DashboardSkeleton />
      ) : isError || !data ? (
        <Card>
          <CardContent className="p-6 flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" /> تعذّر تحميل لوحة التحكم
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Today */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <StatCard label="مواعيد اليوم" value={data.today.appointments} icon={<CalendarDays className="h-5 w-5" />} />
            <StatCard label="المتبقية" value={data.today.scheduled} icon={<CalendarClock className="h-5 w-5" />} />
            <StatCard label="المنجزة" value={data.today.completed} icon={<CalendarCheck className="h-5 w-5" />} />
            <StatCard label="في الانتظار" value={data.today.waiting} icon={<Users className="h-5 w-5" />} />
            <StatCard label="في غرفة الفحص" value={data.today.in_examination} icon={<DoorOpen className="h-5 w-5" />} />
            <StatCard label="أطباء حاضرون" value={data.today.doctors_in} icon={<UserCheck className="h-5 w-5" />} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" /> المواعيد القادمة اليوم
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.today.next.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">لا توجد مواعيد قادمة اليوم</p>
                ) : (
                  <ul className="divide-y">
                    {data.today.next.map((a) => (
                      <li key={a.id} className="py-2 flex items-center gap-3">
                        <span className="font-mono text-sm bg-muted rounded px-2 py-0.5 shrink-0" dir="ltr">
                          {format(new Date(a.scheduled_at), "HH:mm")}
                        </span>
                        {a.patient ? (
                          <Link to={`/patient-profile/${a.patient.id}`} className="font-medium text-primary hover:underline truncate">
                            {a.patient.full_name}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                        <span className="ms-auto text-sm text-muted-foreground truncate">{a.doctor?.full_name ?? ""}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base sm:text-lg">روابط سريعة</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                <Button asChild variant="default" className="justify-start gap-2">
                  <Link to="/appointments"><CalendarPlus className="h-4 w-4" /> موعد جديد</Link>
                </Button>
                <Button asChild variant="outline" className="justify-start gap-2">
                  <Link to="/waiting-list-management"><ListChecks className="h-4 w-4" /> لائحة الانتظار</Link>
                </Button>
                <Button asChild variant="outline" className="justify-start gap-2">
                  <Link to="/patients"><Users className="h-4 w-4" /> المرضى</Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Doctor */}
          {data.doctor && (
            <div className="space-y-3">
              <SectionTitle
                icon={<Activity className="h-5 w-5" />}
                action={
                  <Button asChild variant="outline" size="sm" className="gap-2">
                    <Link to="/my-finances"><Wallet className="h-4 w-4" /> حساباتي</Link>
                  </Button>
                }
              >
                أرقامي هذا الشهر
              </SectionTitle>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="علاجات غير مكتملة" value={data.doctor.unfinished_treatments} icon={<ClipboardList className="h-5 w-5" />} />
                <StatCard label="المحصّل ل.س" value={fmt(data.doctor.month.total_payments_syp)} icon={<Wallet className="h-5 w-5" />} />
                <StatCard label="المحصّل $" value={fmtUsd(data.doctor.month.total_payments_usd)} icon={<Wallet className="h-5 w-5" />} />
                <StatCard label="عدد العلاجات" value={data.doctor.month.treatments_count} icon={<Activity className="h-5 w-5" />} />
              </div>
            </div>
          )}

          {/* Admin */}
          {data.admin && (
            <div className="space-y-4">
              <SectionTitle
                icon={<BarChart3 className="h-5 w-5" />}
                action={
                  <div className="flex gap-2 flex-wrap">
                    <Button asChild variant="outline" size="sm" className="gap-2">
                      <Link to="/reports"><BarChart3 className="h-4 w-4" /> التقارير</Link>
                    </Button>
                    <Button asChild variant="outline" size="sm" className="gap-2">
                      <Link to="/finance"><Landmark className="h-4 w-4" /> المالية</Link>
                    </Button>
                    <Button asChild variant="outline" size="sm" className="gap-2">
                      <Link to="/attendance"><Clock className="h-4 w-4" /> حضور الأطباء</Link>
                    </Button>
                  </div>
                }
              >
                هذا الشهر
              </SectionTitle>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="المدفوعات ل.س" value={fmt(data.admin.month.total_payments_syp)} icon={<Wallet className="h-5 w-5" />} />
                <StatCard label="المدفوعات $" value={fmtUsd(data.admin.month.total_payments_usd)} icon={<Wallet className="h-5 w-5" />} />
                <StatCard
                  label="تكلفة العلاجات"
                  value={fmt(data.admin.month.treatment_cost_syp)}
                  hint={data.admin.month.treatment_cost_usd ? <span dir="ltr">${fmtUsd(data.admin.month.treatment_cost_usd)}</span> : "ل.س"}
                  icon={<ClipboardList className="h-5 w-5" />}
                />
                <StatCard label="مرضى جدد" value={fmt(data.admin.month.new_patients_count)} icon={<UserPlus className="h-5 w-5" />} />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base sm:text-lg">الإيرادات حسب التخصص</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <RevenueTable rows={data.admin.by_specialty} nameKey="specialty_name" nameLabel="التخصص" />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base sm:text-lg">حسب الطبيب</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <RevenueTable
                      rows={[...data.admin.by_doctor].sort((a, b) => b.collected_syp - a.collected_syp).slice(0, 5)}
                      nameKey="doctor_name"
                      nameLabel="الطبيب"
                    />
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base sm:text-lg">أعلى الأرصدة المستحقة</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.admin.top_debtors.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">لا توجد أرصدة مستحقة</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-right">المريض</TableHead>
                            <TableHead className="text-right">الرصيد المستحق ل.س</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.admin.top_debtors.map((d) => (
                            <TableRow key={d.patient_id}>
                              <TableCell>
                                <Link to={`/patient-profile/${d.patient_id}`} className="font-medium text-primary hover:underline">
                                  {d.full_name}
                                </Link>
                              </TableCell>
                              <TableCell className="text-destructive font-medium">{fmt(d.balance)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
