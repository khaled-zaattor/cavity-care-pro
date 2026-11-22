import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subMonths } from "date-fns";
import { Lock } from "lucide-react";
import { SystemStatistics } from "@/components/SystemStatistics";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUserRole } from "@/hooks/useUserRole";
import { apiErrorMessage, Currency, financeApi } from "@/api/clinic";

const money = (n: number | null | undefined, c: Currency) => {
  const v = Number(n ?? 0);
  return c === "USD" ? "$" + v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : Math.round(v).toLocaleString("en-US") + " ل.س";
};

/** تسويتي الشهرية: the logged-in doctor's own settlement (read-only). */
function MySettlementCard() {
  const [period, setPeriod] = useState(format(subMonths(new Date(), 1), "yyyy-MM"));
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-settlement", period],
    queryFn: () => financeApi.mySettlement(period),
  });

  const rows = data?.rows ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 space-y-0">
        <div>
          <CardTitle>تسويتي الشهرية</CardTitle>
          <CardDescription>الإيرادات المحصلة خلال الشهر ناقص المصاريف، ثم نسبتك من الصافي.</CardDescription>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <Label htmlFor="my_period">الشهر</Label>
            <Input id="my_period" type="month" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} className="w-44" />
          </div>
          {data &&
            (data.closed ? (
              <Badge variant="secondary" className="h-9">
                <Lock className="h-3 w-3 ml-1" />
                مغلق
              </Badge>
            ) : (
              <Badge variant="outline" className="h-9">
                مفتوح
              </Badge>
            ))}
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {isLoading ? (
          <div className="text-center py-6">جاري التحميل...</div>
        ) : error ? (
          <div className="text-center py-6 text-destructive">{apiErrorMessage(error)}</div>
        ) : !rows.length ? (
          <div className="text-center py-6 text-muted-foreground">لا توجد بيانات لهذا الشهر</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>العملة</TableHead>
                <TableHead>الإيرادات المحصلة</TableHead>
                <TableHead>المصاريف</TableHead>
                <TableHead>الصافي</TableHead>
                <TableHead>نسبتي</TableHead>
                <TableHead>حصتي</TableHead>
                <TableHead>المدفوع لي</TableHead>
                <TableHead>المتبقي</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const expenses = Number(r.direct_expenses) + Number(r.allocated_expenses);
                return (
                  <TableRow key={r.currency}>
                    <TableCell>{r.currency === "USD" ? "$" : "ل.س"}</TableCell>
                    <TableCell>{money(r.revenue, r.currency)}</TableCell>
                    <TableCell title={`مباشرة ${money(r.direct_expenses, r.currency)} + مشتركة ${money(r.allocated_expenses, r.currency)}`}>
                      {money(expenses, r.currency)}
                      <div className="text-xs text-muted-foreground">
                        مباشرة {money(r.direct_expenses, r.currency)} + مشتركة {money(r.allocated_expenses, r.currency)}
                      </div>
                    </TableCell>
                    <TableCell className={Number(r.net) < 0 ? "text-destructive" : ""}>{money(r.net, r.currency)}</TableCell>
                    <TableCell>{Number(r.percent)}%</TableCell>
                    <TableCell className="font-semibold">{money(r.doctor_share, r.currency)}</TableCell>
                    <TableCell>{money(r.paid, r.currency)}</TableCell>
                    <TableCell className={Number(r.owed) > 0 ? "text-destructive font-semibold" : ""}>{money(r.owed, r.currency)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

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
    <div className="container mx-auto p-4 md:p-6 space-y-6" dir="rtl">
      <MySettlementCard />
      <SystemStatistics fixedDoctorId={doctorId} title="حساباتي" />
    </div>
  );
}
