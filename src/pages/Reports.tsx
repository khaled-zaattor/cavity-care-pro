import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import { BarChart3, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dayEndIso, dayStartIso, reportsApi, RevenueReport } from "@/api/clinic";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtUsd = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

const GROUPS: { value: RevenueReport["group_by"]; label: string }[] = [
  { value: "doctor", label: "حسب الطبيب" },
  { value: "specialty", label: "حسب التخصص" },
  { value: "doctor_specialty", label: "حسب الطبيب والتخصص" },
];

/**
 * التقارير المالية: revenue per doctor / specialty.
 * "محصّل" = payments received in the period (the basis of the doctor's percentage),
 * "مفوتر" = treatment prices recorded in the period.
 */
export default function Reports() {
  const now = new Date();
  const [from, setFrom] = useState(format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(now, "yyyy-MM-dd"));
  const [groupBy, setGroupBy] = useState<RevenueReport["group_by"]>("doctor");

  const { data: report, isLoading } = useQuery({
    queryKey: ["revenue-report", from, to, groupBy],
    queryFn: () => reportsApi.revenue(dayStartIso(from), dayEndIso(to), groupBy),
  });

  const showDoctor = groupBy !== "specialty";
  const showSpecialty = groupBy !== "doctor";

  const exportExcel = () => {
    if (!report) return;
    const rows = report.rows.map((r) => ({
      ...(showDoctor ? { "الطبيب": r.doctor_name ?? "-" } : {}),
      ...(showSpecialty ? { "التخصص": r.specialty_name ?? "-" } : {}),
      "عدد العلاجات": r.treatments,
      "مفوتر ل.س": r.charged_syp,
      "مفوتر $": r.charged_usd,
      "محصّل ل.س": r.collected_syp,
      "محصّل $": r.collected_usd,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الإيرادات");
    XLSX.writeFile(wb, `revenue_${groupBy}_${from}_${to}.xlsx`);
  };

  return (
    <div className="space-y-4 lg:space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <BarChart3 className="h-5 w-5 text-primary" />
        </div>
        <h1 className="text-2xl lg:text-3xl font-bold">التقارير المالية</h1>
      </div>

      <Card>
        <CardContent className="pt-6 grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
          <div>
            <Label htmlFor="rep_from">من تاريخ</Label>
            <Input id="rep_from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="rep_to">إلى تاريخ</Label>
            <Input id="rep_to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <Label>التجميع</Label>
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as RevenueReport["group_by"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GROUPS.map((g) => (
                  <SelectItem key={g.value} value={g.value}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={exportExcel} disabled={!report?.rows.length}>
            <Download className="h-4 w-4 ml-2" />
            تصدير Excel
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>الإيرادات</CardTitle>
          <CardDescription>
            المحصّل = الدفعات المستلمة خلال الفترة (أساس نسبة الطبيب). المفوتر = أسعار العلاجات المسجلة خلال الفترة.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? (
            <div className="text-center py-8">جاري التحميل...</div>
          ) : !report?.rows.length ? (
            <div className="text-center py-8 text-muted-foreground">لا توجد بيانات في هذه الفترة</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {showDoctor && <TableHead>الطبيب</TableHead>}
                  {showSpecialty && <TableHead>التخصص</TableHead>}
                  <TableHead>العلاجات</TableHead>
                  <TableHead>مفوتر ل.س</TableHead>
                  <TableHead>مفوتر $</TableHead>
                  <TableHead>محصّل ل.س</TableHead>
                  <TableHead>محصّل $</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((r, i) => (
                  <TableRow key={`${r.doctor_id}-${r.specialty_id}-${i}`}>
                    {showDoctor && <TableCell className="font-medium">{r.doctor_name ?? "-"}</TableCell>}
                    {showSpecialty && <TableCell>{r.specialty_name ?? "-"}</TableCell>}
                    <TableCell>{r.treatments}</TableCell>
                    <TableCell>{fmt(r.charged_syp)}</TableCell>
                    <TableCell>{fmtUsd(r.charged_usd)}</TableCell>
                    <TableCell className="font-semibold">{fmt(r.collected_syp)}</TableCell>
                    <TableCell className="font-semibold">{fmtUsd(r.collected_usd)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={(showDoctor ? 1 : 0) + (showSpecialty ? 1 : 0)}>المجموع</TableCell>
                  <TableCell>{report.totals.treatments}</TableCell>
                  <TableCell>{fmt(report.totals.charged_syp)}</TableCell>
                  <TableCell>{fmtUsd(report.totals.charged_usd)}</TableCell>
                  <TableCell>{fmt(report.totals.collected_syp)}</TableCell>
                  <TableCell>{fmtUsd(report.totals.collected_usd)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
