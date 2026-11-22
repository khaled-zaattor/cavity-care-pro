import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, subMonths } from "date-fns";
import * as XLSX from "xlsx";
import { AlertTriangle, Download, Edit, Lock, Plus, Trash2, Unlock, Wallet } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import {
  Allocation,
  apiErrorMessage,
  CompensationRule,
  Currency,
  Doctor,
  doctorsApi,
  Expense,
  ExpenseCategory,
  financeApi,
  RecurringExpense,
  SettlementPeriod,
  SettlementRow,
  specialtiesApi,
  Specialty,
} from "@/api/clinic";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const money =(n: number | null | undefined, c: Currency) => {
  const v = Number(n ?? 0);
  return c === "USD" ? "$" + v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : Math.round(v).toLocaleString("en-US") + " ل.س";
};
const pct = (n: number) => `${Number((n * 100).toFixed(1))}%`;
const prevMonth = () => format(subMonths(new Date(), 1), "yyyy-MM");
const thisMonth = () => format(new Date(), "yyyy-MM");
const today = () => format(new Date(), "yyyy-MM-dd");
const errorToast = (e: unknown) => toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" });
const CURRENCIES: Currency[] = ["SYP", "USD"];
const ALLOCATION_LABELS: Record<Allocation, string> = {
  clinic_wide: "مشترك (حسب الساعات)",
  specialty: "على تخصص",
  doctor: "على طبيب",
};

function useLookups() {
  const { data: doctors = [] } = useQuery({ queryKey: ["doctors", "finance-list"], queryFn: () => doctorsApi.list() });
  const { data: specialties = [] } = useQuery({ queryKey: ["specialties", "all"], queryFn: () => specialtiesApi.list(true) });
  const doctorName = (id: string | null | undefined) => doctors.find((d) => d.id === id)?.full_name ?? "-";
  const specialtyName = (id: string | null | undefined) => specialties.find((s) => s.id === id)?.name_ar ?? "-";
  return { doctors, specialties, doctorName, specialtyName };
}

function allocationText(
  a: Allocation,
  doctorId: string | null,
  specialtyId: string | null,
  doctorName: (id: string | null) => string,
  specialtyName: (id: string | null) => string,
) {
  if (a === "specialty") return `على تخصص: ${specialtyName(specialtyId)}`;
  if (a === "doctor") return `على طبيب: ${doctorName(doctorId)}`;
  return ALLOCATION_LABELS.clinic_wide;
}

/** A button that asks for confirmation before running `onConfirm`. */
function Confirm({
  trigger,
  title,
  description,
  actionLabel = "تأكيد",
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel>إلغاء</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{actionLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteButton({ title, onConfirm }: { title: string; onConfirm: () => void }) {
  return (
    <Confirm
      trigger={
        <Button variant="ghost" size="icon" title="حذف">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      }
      title={title}
      description="لا يمكن التراجع عن هذا الإجراء."
      actionLabel="حذف"
      onConfirm={onConfirm}
    />
  );
}

function MonthInput({ id, value, onChange, label = "الشهر" }: { id: string; value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="month" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} className="w-44" />
    </div>
  );
}

function DoctorSelect({ doctors, value, onChange, placeholder = "اختر الطبيب" }: { doctors: Doctor[]; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {doctors.map((d) => (
          <SelectItem key={d.id} value={d.id}>
            {d.full_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CurrencySelect({ value, onChange }: { value: Currency; onChange: (v: Currency) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Currency)}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="SYP">ليرة سورية (ل.س)</SelectItem>
        <SelectItem value="USD">دولار ($)</SelectItem>
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------------------
// page
// ---------------------------------------------------------------------------

export default function Finance() {
  const { isSuperAdmin, isLoading } = useUserRole();
  const [payout, setPayout] = useState<PayoutForm | null>(null);

  if (isLoading) return <p className="text-muted-foreground p-6">جاري التحميل...</p>;
  if (!isSuperAdmin) return <p className="text-muted-foreground p-6" dir="rtl">المالية للمدير فقط.</p>;

  return (
    <div className="space-y-4 lg:space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <Wallet className="h-5 w-5 text-primary" />
        </div>
        <h1 className="text-2xl lg:text-3xl font-bold">المالية</h1>
      </div>

      <Tabs defaultValue="settlement" dir="rtl">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="settlement">التسوية الشهرية</TabsTrigger>
          <TabsTrigger value="expenses">المصاريف</TabsTrigger>
          <TabsTrigger value="recurring">المصاريف الشهرية الثابتة</TabsTrigger>
          <TabsTrigger value="rules">نسب الأطباء</TabsTrigger>
          <TabsTrigger value="payouts">دفعات الأطباء</TabsTrigger>
        </TabsList>
        <TabsContent value="settlement">
          <SettlementTab onPayout={setPayout} />
        </TabsContent>
        <TabsContent value="expenses">
          <ExpensesTab />
        </TabsContent>
        <TabsContent value="recurring">
          <RecurringTab />
        </TabsContent>
        <TabsContent value="rules">
          <RulesTab />
        </TabsContent>
        <TabsContent value="payouts">
          <PayoutsTab onPayout={setPayout} />
        </TabsContent>
      </Tabs>

      <PayoutDialog form={payout} setForm={setPayout} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// a) settlement
// ---------------------------------------------------------------------------

const SUM_KEYS = ["revenue", "direct_expenses", "allocated_expenses", "net", "doctor_share", "clinic_share", "paid", "owed"] as const;

function SettlementTab({ onPayout }: { onPayout: (f: PayoutForm) => void }) {
  const queryClient = useQueryClient();
  const { specialtyName } = useLookups();
  const [period, setPeriod] = useState(prevMonth());
  const [detail, setDetail] = useState<SettlementRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["settlement", period],
    queryFn: () => financeApi.settlements(period),
  });

  const onDone = (d: SettlementPeriod, msg: string) => {
    queryClient.setQueryData(["settlement", period], d);
    queryClient.invalidateQueries({ queryKey: ["settlement"] });
    toast({ title: "تم", description: msg });
  };
  const close = useMutation({ mutationFn: () => financeApi.close(period), onSuccess: (d) => onDone(d, "تم إغلاق الشهر"), onError: errorToast });
  const reopen = useMutation({ mutationFn: () => financeApi.reopen(period), onSuccess: (d) => onDone(d, "تمت إعادة فتح الشهر"), onError: errorToast });

  const rows = data?.rows ?? [];
  const totals = CURRENCIES.map((c) => {
    const rs = rows.filter((r) => r.currency === c);
    const sums = Object.fromEntries(SUM_KEYS.map((k) => [k, rs.reduce((s, r) => s + Number(r[k] ?? 0), 0)])) as Record<(typeof SUM_KEYS)[number], number>;
    return { currency: c, count: rs.length, ...sums };
  }).filter((t) => t.count > 0);

  const canClose = !!data && !data.closed && period < thisMonth();

  const exportExcel = () => {
    if (!rows.length) return;
    const sheet = rows.map((r) => ({
      "الطبيب": r.doctor_name,
      "حسابات مستقلة": r.has_own_books ? "نعم" : "",
      "العملة": r.currency,
      "الساعات": Number(r.hours),
      "الإيرادات المحصلة": Number(r.revenue),
      "مصاريف مباشرة": Number(r.direct_expenses),
      "حصة المصاريف المشتركة": Number(r.allocated_expenses),
      "خسارة مرحّلة": Number(r.carried_loss),
      "الصافي": Number(r.net),
      "النسبة %": Number(r.percent),
      "حصة الطبيب": Number(r.doctor_share),
      "حصة العيادة": Number(r.clinic_share),
      "المدفوع": Number(r.paid),
      "المتبقي": Number(r.owed),
    }));
    const ws = XLSX.utils.json_to_sheet(sheet);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "التسوية");
    XLSX.writeFile(wb, `settlement_${period}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-4">
          <MonthInput id="settle_period" value={period} onChange={setPeriod} />
          {data &&
            (data.closed ? (
              <Badge variant="secondary" className="h-8">
                <Lock className="h-3 w-3 ml-1" />
                مغلق{data.closed_at ? ` (${format(new Date(data.closed_at), "yyyy-MM-dd HH:mm")})` : ""}
              </Badge>
            ) : (
              <Badge variant="outline" className="h-8">
                مفتوح
              </Badge>
            ))}
          <div className="flex flex-wrap gap-2 ms-auto">
            {data && !data.closed && (
              <Confirm
                trigger={
                  <Button disabled={!canClose || close.isPending} title={period >= thisMonth() ? "لا يمكن إغلاق الشهر الحالي قبل انتهائه" : undefined}>
                    <Lock className="h-4 w-4 ml-2" />
                    إغلاق الشهر
                  </Button>
                }
                title={`إغلاق شهر ${period}`}
                description="بعد الإغلاق تثبت الأرقام ولا يمكن تعديل مصاريف أو حضور هذا الشهر."
                actionLabel="إغلاق الشهر"
                onConfirm={() => close.mutate()}
              />
            )}
            {data?.closed && (
              <Confirm
                trigger={
                  <Button variant="outline" disabled={reopen.isPending}>
                    <Unlock className="h-4 w-4 ml-2" />
                    إعادة فتح الشهر
                  </Button>
                }
                title={`إعادة فتح شهر ${period}`}
                description="ستُحذف الأرقام المثبتة وتُحسب التسوية من جديد عند العرض، ويصبح تعديل المصاريف والحضور لهذا الشهر ممكناً."
                actionLabel="إعادة فتح"
                onConfirm={() => reopen.mutate()}
              />
            )}
            <Button variant="outline" onClick={() => onPayout({ ...emptyPayout(), period })}>
              <Plus className="h-4 w-4 ml-2" />
              تسجيل دفعة للطبيب
            </Button>
            <Button variant="outline" onClick={exportExcel} disabled={!rows.length}>
              <Download className="h-4 w-4 ml-2" />
              تصدير Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      {data?.warnings.map((w) => (
        <Alert key={w} className="border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 !text-amber-600" />
          <AlertDescription>{w}</AlertDescription>
        </Alert>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>تسوية شهر {period}</CardTitle>
          <CardDescription>
            {data &&
              (data.allocation_basis === "hours"
                ? `وُزعت المصاريف المشتركة حسب ساعات الحضور (المجموع ${Number(data.total_hours).toLocaleString("en-US")} ساعة)`
                : "وُزعت المصاريف المشتركة حسب الإيرادات")}
            {" — "}اضغط على أي سطر لرؤية طريقة الحساب.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? (
            <div className="text-center py-8">جاري التحميل...</div>
          ) : !rows.length ? (
            <div className="text-center py-8 text-muted-foreground">لا توجد بيانات لهذا الشهر</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الطبيب</TableHead>
                  <TableHead>العملة</TableHead>
                  <TableHead>الساعات</TableHead>
                  <TableHead>الإيرادات المحصلة</TableHead>
                  <TableHead>مصاريف مباشرة</TableHead>
                  <TableHead>حصة المصاريف المشتركة</TableHead>
                  <TableHead>الصافي</TableHead>
                  <TableHead>النسبة %</TableHead>
                  <TableHead>حصة الطبيب</TableHead>
                  <TableHead>حصة العيادة</TableHead>
                  <TableHead>المدفوع</TableHead>
                  <TableHead>المتبقي</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={`${r.doctor_id}-${r.currency}`} className="cursor-pointer" onClick={() => setDetail(r)}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {r.doctor_name}
                      {r.has_own_books && (
                        <Badge variant="outline" className="mr-2">
                          حسابات مستقلة
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{r.currency === "USD" ? "$" : "ل.س"}</TableCell>
                    <TableCell>{Number(r.hours).toLocaleString("en-US")}</TableCell>
                    <TableCell>{money(r.revenue, r.currency)}</TableCell>
                    <TableCell>{money(r.direct_expenses, r.currency)}</TableCell>
                    <TableCell>{money(r.allocated_expenses, r.currency)}</TableCell>
                    <TableCell className={Number(r.net) < 0 ? "text-destructive" : ""}>{money(r.net, r.currency)}</TableCell>
                    <TableCell>{Number(r.percent)}%</TableCell>
                    <TableCell className="font-semibold">{money(r.doctor_share, r.currency)}</TableCell>
                    <TableCell>{money(r.clinic_share, r.currency)}</TableCell>
                    <TableCell>{money(r.paid, r.currency)}</TableCell>
                    <TableCell className={Number(r.owed) > 0 ? "text-destructive font-semibold" : ""}>{money(r.owed, r.currency)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {Number(r.owed) > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            onPayout({ ...emptyPayout(), doctor_id: r.doctor_id, currency: r.currency, amount: String(Number(r.owed)), period })
                          }
                        >
                          دفع
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                {totals.map((t) => (
                  <TableRow key={t.currency}>
                    <TableCell colSpan={3}>المجموع ({t.currency === "USD" ? "$" : "ل.س"})</TableCell>
                    <TableCell>{money(t.revenue, t.currency)}</TableCell>
                    <TableCell>{money(t.direct_expenses, t.currency)}</TableCell>
                    <TableCell>{money(t.allocated_expenses, t.currency)}</TableCell>
                    <TableCell>{money(t.net, t.currency)}</TableCell>
                    <TableCell />
                    <TableCell>{money(t.doctor_share, t.currency)}</TableCell>
                    <TableCell>{money(t.clinic_share, t.currency)}</TableCell>
                    <TableCell>{money(t.paid, t.currency)}</TableCell>
                    <TableCell className={t.owed > 0 ? "text-destructive" : ""}>{money(t.owed, t.currency)}</TableCell>
                    <TableCell />
                  </TableRow>
                ))}
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent dir="rtl" className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              طريقة الحساب — {detail?.doctor_name} ({detail?.currency === "USD" ? "$" : "ل.س"})
            </DialogTitle>
          </DialogHeader>
          {detail && data && <CalculationLines row={detail} basis={data.allocation_basis} specialtyName={specialtyName} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CalculationLines({ row, basis, specialtyName }: { row: SettlementRow; basis: "hours" | "revenue"; specialtyName: (id: string | null) => string }) {
  const c = row.currency;
  const m = (n: number) => money(n, c);
  const revenue = Number(row.revenue);
  const net = Number(row.net);
  const perSpecialty = row.details?.per_specialty ?? [];
  const allocation = row.details?.allocation ?? [];
  const carried = Number(row.carried_loss ?? 0);

  let first = `الإيرادات ${m(revenue)} − مصاريف مباشرة ${m(row.direct_expenses)} − حصة الإيجار والمصاريف المشتركة ${m(row.allocated_expenses)}`;
  if (carried > 0) first += ` − خسارة مرحّلة ${m(carried)}`;
  first += ` = الصافي ${m(net)}`;
  if (net > 0 && perSpecialty.length <= 1) {
    const p = perSpecialty[0]?.percent ?? row.percent;
    first += ` × ${Number(p)}% = ${m(row.doctor_share)}`;
  }

  return (
    <div className="space-y-3 text-sm leading-7">
      <p className="font-medium">{first}</p>
      {net <= 0 && <p className="text-muted-foreground">الصافي صفر أو سالب، لذلك حصة الطبيب 0.</p>}

      {net > 0 && perSpecialty.length > 1 && (
        <div>
          <p className="font-medium">توزيع الصافي على التخصصات حسب إيرادات كل تخصص:</p>
          <ul className="list-disc pr-5">
            {perSpecialty.map((s, i) => {
              const partNet = revenue > 0 ? (net * Number(s.revenue)) / revenue : 0;
              return (
                <li key={`${s.specialty_id}-${i}`}>
                  {s.specialty_id ? specialtyName(s.specialty_id) : "بدون تخصص"}: إيرادات {m(s.revenue)} → صافي {m(partNet)} × {Number(s.percent)}% ={" "}
                  {m((partNet * Number(s.percent)) / 100)}
                </li>
              );
            })}
          </ul>
          <p>المجموع = {m(row.doctor_share)}</p>
        </div>
      )}

      {allocation.length > 0 && (
        <div>
          <p className="font-medium">حصة المصاريف المشتركة:</p>
          <ul className="list-disc pr-5">
            {allocation.map((a, i) => (
              <li key={`${a.type}-${a.specialty_id ?? ""}-${i}`}>
                {a.type === "clinic_wide"
                  ? `الإيجار والمصاريف العامة ${m(a.total)} × ${pct(Number(a.ratio))} من ${basis === "hours" ? "الساعات" : "الإيرادات"}`
                  : `مصاريف تخصص ${specialtyName(a.specialty_id ?? null)} ${m(a.total)} × ${pct(Number(a.ratio))} (حصته بين أطباء التخصص)`}
                {" = "}
                {m(Number(a.total) * Number(a.ratio))}
              </li>
            ))}
          </ul>
        </div>
      )}
      {row.has_own_books && <p className="text-muted-foreground">طبيب بحسابات مستقلة: لا يتحمل المصاريف العامة للعيادة.</p>}

      <div className="border-t pt-2 grid grid-cols-2 gap-1">
        <span>حصة الطبيب: {m(row.doctor_share)}</span>
        <span>حصة العيادة: {m(row.clinic_share)}</span>
        <span>المدفوع: {m(row.paid)}</span>
        <span className={Number(row.owed) > 0 ? "text-destructive font-semibold" : ""}>المتبقي: {m(row.owed)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// shared allocation fields (expenses + recurring)
// ---------------------------------------------------------------------------

interface ExpenseForm {
  id?: string;
  category_id: string;
  amount: string;
  currency: Currency;
  spent_at: string;
  allocation: Allocation;
  doctor_id: string;
  specialty_id: string;
  notes: string;
}

function ExpenseFields({
  form,
  setForm,
  categories,
  doctors,
  specialties,
  withDate,
}: {
  form: ExpenseForm;
  setForm: (f: ExpenseForm) => void;
  categories: ExpenseCategory[];
  doctors: Doctor[];
  specialties: Specialty[];
  withDate: boolean;
}) {
  const options = categories.filter((c) => c.is_active || c.id === form.category_id);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="sm:col-span-2">
        <Label>الفئة</Label>
        <Select
          value={form.category_id || undefined}
          onValueChange={(v) => {
            const cat = categories.find((c) => c.id === v);
            setForm({ ...form, category_id: v, allocation: cat?.default_allocation ?? form.allocation });
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="اختر الفئة" />
          </SelectTrigger>
          <SelectContent>
            {options.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="exp_amount">المبلغ</Label>
        <Input id="exp_amount" type="number" min="0" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
      </div>
      <div>
        <Label>العملة</Label>
        <CurrencySelect value={form.currency} onChange={(currency) => setForm({ ...form, currency })} />
      </div>
      {withDate && (
        <div>
          <Label htmlFor="exp_date">التاريخ</Label>
          <Input id="exp_date" type="date" value={form.spent_at} onChange={(e) => setForm({ ...form, spent_at: e.target.value })} />
        </div>
      )}
      <div>
        <Label>التوزيع</Label>
        <Select value={form.allocation} onValueChange={(v) => setForm({ ...form, allocation: v as Allocation })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="clinic_wide">مشترك على كل الأطباء (حسب الساعات)</SelectItem>
            <SelectItem value="specialty">على تخصص</SelectItem>
            <SelectItem value="doctor">على طبيب</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {form.allocation === "specialty" && (
        <div>
          <Label>التخصص</Label>
          <Select value={form.specialty_id || undefined} onValueChange={(v) => setForm({ ...form, specialty_id: v })}>
            <SelectTrigger>
              <SelectValue placeholder="اختر التخصص" />
            </SelectTrigger>
            <SelectContent>
              {specialties
                .filter((s) => s.is_active || s.id === form.specialty_id)
                .map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name_ar}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {form.allocation === "doctor" && (
        <div>
          <Label>الطبيب</Label>
          <DoctorSelect doctors={doctors} value={form.doctor_id} onChange={(v) => setForm({ ...form, doctor_id: v })} />
        </div>
      )}
      <div className="sm:col-span-2">
        <Label htmlFor="exp_notes">ملاحظات</Label>
        <Textarea id="exp_notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>
    </div>
  );
}

function expenseBody(f: ExpenseForm) {
  return {
    category_id: f.category_id,
    amount: Number(f.amount),
    currency: f.currency,
    allocation: f.allocation,
    doctor_id: f.allocation === "doctor" ? f.doctor_id || null : null,
    specialty_id: f.allocation === "specialty" ? f.specialty_id || null : null,
    notes: f.notes.trim() || null,
  };
}

function validateExpense(f: ExpenseForm): string | null {
  if (!f.category_id) return "اختر الفئة";
  if (!(Number(f.amount) > 0)) return "أدخل مبلغاً أكبر من صفر";
  if (f.allocation === "doctor" && !f.doctor_id) return "اختر الطبيب";
  if (f.allocation === "specialty" && !f.specialty_id) return "اختر التخصص";
  return null;
}

const emptyExpense = (spent_at: string): ExpenseForm => ({
  category_id: "",
  amount: "",
  currency: "SYP",
  spent_at,
  allocation: "clinic_wide",
  doctor_id: "",
  specialty_id: "",
  notes: "",
});

// ---------------------------------------------------------------------------
// b) expenses
// ---------------------------------------------------------------------------

function ExpensesTab() {
  const queryClient = useQueryClient();
  const { doctors, specialties, doctorName, specialtyName } = useLookups();
  const [period, setPeriod] = useState(thisMonth());
  const [form, setForm] = useState<ExpenseForm | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["expenses", period], queryFn: () => financeApi.expenses(period) });
  const { data: categories = [] } = useQuery({ queryKey: ["expense-categories"], queryFn: () => financeApi.categories() });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["expenses"] });
    queryClient.invalidateQueries({ queryKey: ["settlement"] });
  };

  const save = useMutation({
    mutationFn: (f: ExpenseForm) => {
      const body = { ...expenseBody(f), spent_at: f.spent_at };
      return f.id ? financeApi.updateExpense(f.id, body) : financeApi.addExpense(body);
    },
    onSuccess: () => {
      refresh();
      setForm(null);
      toast({ title: "تم الحفظ", description: "تم حفظ المصروف" });
    },
    onError: errorToast,
  });
  const remove = useMutation({
    mutationFn: (id: string) => financeApi.removeExpense(id),
    onSuccess: () => {
      refresh();
      toast({ title: "تم الحذف", description: "تم حذف المصروف" });
    },
    onError: errorToast,
  });

  const submit = () => {
    if (!form) return;
    const err = validateExpense(form);
    if (err) return toast({ title: "تنبيه", description: err, variant: "destructive" });
    save.mutate(form);
  };

  const defaultDate = period === thisMonth() ? today() : `${period}-01`;
  const rows = data?.data ?? [];
  const totals = data?.totals ?? {};

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-4">
          <MonthInput id="exp_period" value={period} onChange={setPeriod} />
          <div className="flex gap-2 flex-wrap">
            {CURRENCIES.filter((c) => totals[c] !== undefined).map((c) => (
              <Badge key={c} variant="secondary" className="h-8 text-sm">
                المجموع: {money(totals[c] ?? 0, c)}
              </Badge>
            ))}
          </div>
          <Button className="ms-auto" onClick={() => setForm(emptyExpense(defaultDate))}>
            <Plus className="h-4 w-4 ml-2" />
            إضافة مصروف
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>مصاريف شهر {period}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? (
            <div className="text-center py-8">جاري التحميل...</div>
          ) : !rows.length ? (
            <div className="text-center py-8 text-muted-foreground">لا توجد مصاريف في هذا الشهر</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>الفئة</TableHead>
                  <TableHead>المبلغ</TableHead>
                  <TableHead>التوزيع</TableHead>
                  <TableHead>ملاحظات</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e: Expense) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap">{e.spent_at?.slice(0, 10)}</TableCell>
                    <TableCell>
                      {e.category?.name ?? "-"}
                      {e.recurring_expense_id && (
                        <Badge variant="outline" className="mr-2">
                          شهري ثابت
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-semibold whitespace-nowrap">{money(e.amount, e.currency)}</TableCell>
                    <TableCell>
                      {e.allocation === "specialty"
                        ? `على تخصص: ${e.specialty?.name_ar ?? specialtyName(e.specialty_id)}`
                        : e.allocation === "doctor"
                          ? `على طبيب: ${e.doctor?.full_name ?? doctorName(e.doctor_id)}`
                          : ALLOCATION_LABELS.clinic_wide}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{e.notes ?? ""}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="تعديل"
                        onClick={() =>
                          setForm({
                            id: e.id,
                            category_id: e.category_id,
                            amount: String(e.amount),
                            currency: e.currency,
                            spent_at: e.spent_at?.slice(0, 10) ?? defaultDate,
                            allocation: e.allocation,
                            doctor_id: e.doctor_id ?? "",
                            specialty_id: e.specialty_id ?? "",
                            notes: e.notes ?? "",
                          })
                        }
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <DeleteButton title="حذف هذا المصروف؟" onConfirm={() => remove.mutate(e.id)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CategoriesCard categories={categories} />

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form?.id ? "تعديل مصروف" : "إضافة مصروف"}</DialogTitle>
          </DialogHeader>
          {form && <ExpenseFields form={form} setForm={setForm} categories={categories} doctors={doctors} specialties={specialties} withDate />}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setForm(null)}>
              إلغاء
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CategoriesCard({ categories }: { categories: ExpenseCategory[] }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<{ id?: string; name: string; default_allocation: Allocation } | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
  const save = useMutation({
    mutationFn: (f: { id?: string; name: string; default_allocation: Allocation }) =>
      f.id
        ? financeApi.updateCategory(f.id, { name: f.name, default_allocation: f.default_allocation })
        : financeApi.addCategory({ name: f.name, default_allocation: f.default_allocation }),
    onSuccess: () => {
      refresh();
      setForm(null);
      toast({ title: "تم الحفظ", description: "تم حفظ الفئة" });
    },
    onError: errorToast,
  });
  const toggle = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => financeApi.updateCategory(id, { is_active }),
    onSuccess: refresh,
    onError: errorToast,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-lg">الفئات</CardTitle>
          <CardDescription>التوزيع الافتراضي يُختار تلقائياً عند اختيار الفئة في مصروف جديد.</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => setForm({ name: "", default_allocation: "clinic_wide" })}>
          <Plus className="h-4 w-4 ml-1" />
          فئة جديدة
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الفئة</TableHead>
              <TableHead>التوزيع الافتراضي</TableHead>
              <TableHead>فعالة</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>{ALLOCATION_LABELS[c.default_allocation]}</TableCell>
                <TableCell>
                  <Switch checked={c.is_active} onCheckedChange={(v) => toggle.mutate({ id: c.id, is_active: v })} />
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" title="تعديل" onClick={() => setForm({ id: c.id, name: c.name, default_allocation: c.default_allocation })}>
                    <Edit className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form?.id ? "تعديل فئة" : "فئة جديدة"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="cat_name">الاسم</Label>
                <Input id="cat_name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label>التوزيع الافتراضي</Label>
                <Select value={form.default_allocation} onValueChange={(v) => setForm({ ...form, default_allocation: v as Allocation })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clinic_wide">مشترك (حسب الساعات)</SelectItem>
                    <SelectItem value="specialty">على تخصص</SelectItem>
                    <SelectItem value="doctor">على طبيب</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setForm(null)}>
              إلغاء
            </Button>
            <Button onClick={() => form && form.name.trim() && save.mutate({ ...form, name: form.name.trim() })} disabled={save.isPending || !form?.name.trim()}>
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// c) recurring
// ---------------------------------------------------------------------------

function RecurringTab() {
  const queryClient = useQueryClient();
  const { doctors, specialties, doctorName, specialtyName } = useLookups();
  const [form, setForm] = useState<ExpenseForm | null>(null);

  const { data: rows = [], isLoading } = useQuery({ queryKey: ["recurring-expenses"], queryFn: () => financeApi.recurring() });
  const { data: categories = [] } = useQuery({ queryKey: ["expense-categories"], queryFn: () => financeApi.categories() });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["recurring-expenses"] });
  const save = useMutation({
    mutationFn: (f: ExpenseForm) => (f.id ? financeApi.updateRecurring(f.id, expenseBody(f)) : financeApi.addRecurring(expenseBody(f))),
    onSuccess: () => {
      refresh();
      setForm(null);
      toast({ title: "تم الحفظ", description: "تم حفظ المصروف الشهري" });
    },
    onError: errorToast,
  });
  const toggle = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => financeApi.updateRecurring(id, { is_active }),
    onSuccess: refresh,
    onError: errorToast,
  });
  const remove = useMutation({
    mutationFn: (id: string) => financeApi.removeRecurring(id),
    onSuccess: () => {
      refresh();
      toast({ title: "تم الحذف", description: "تم حذف المصروف الشهري" });
    },
    onError: errorToast,
  });

  const submit = () => {
    if (!form) return;
    const err = validateExpense(form);
    if (err) return toast({ title: "تنبيه", description: err, variant: "destructive" });
    save.mutate(form);
  };

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle>المصاريف الشهرية الثابتة</CardTitle>
          <CardDescription>تُضاف تلقائياً في أول كل شهر (مثل الإيجار).</CardDescription>
        </div>
        <Button onClick={() => setForm(emptyExpense(""))}>
          <Plus className="h-4 w-4 ml-2" />
          إضافة مصروف ثابت
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {isLoading ? (
          <div className="text-center py-8">جاري التحميل...</div>
        ) : !rows.length ? (
          <div className="text-center py-8 text-muted-foreground">لا توجد مصاريف ثابتة</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الفئة</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>التوزيع</TableHead>
                <TableHead>ملاحظات</TableHead>
                <TableHead>فعال</TableHead>
                <TableHead>آخر شهر أُضيف</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: RecurringExpense) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.category?.name ?? "-"}</TableCell>
                  <TableCell className="font-semibold whitespace-nowrap">{money(r.amount, r.currency)}</TableCell>
                  <TableCell>{allocationText(r.allocation, r.doctor_id, r.specialty_id, doctorName, specialtyName)}</TableCell>
                  <TableCell className="max-w-xs truncate">{r.notes ?? ""}</TableCell>
                  <TableCell>
                    <Switch checked={r.is_active} onCheckedChange={(v) => toggle.mutate({ id: r.id, is_active: v })} />
                  </TableCell>
                  <TableCell>{r.last_generated_period ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="تعديل"
                      onClick={() =>
                        setForm({
                          id: r.id,
                          category_id: r.category_id,
                          amount: String(r.amount),
                          currency: r.currency,
                          spent_at: "",
                          allocation: r.allocation,
                          doctor_id: r.doctor_id ?? "",
                          specialty_id: r.specialty_id ?? "",
                          notes: r.notes ?? "",
                        })
                      }
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <DeleteButton title="حذف هذا المصروف الثابت؟ (المصاريف التي أُضيفت سابقاً تبقى)" onConfirm={() => remove.mutate(r.id)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form?.id ? "تعديل مصروف ثابت" : "إضافة مصروف ثابت"}</DialogTitle>
          </DialogHeader>
          {form && <ExpenseFields form={form} setForm={setForm} categories={categories} doctors={doctors} specialties={specialties} withDate={false} />}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setForm(null)}>
              إلغاء
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// d) percentage rules
// ---------------------------------------------------------------------------

interface RuleForm {
  doctor_id: string;
  specialty_id: string; // "all" = every specialty
  percent: string;
  effective_from: string;
  notes: string;
}

function RulesTab() {
  const queryClient = useQueryClient();
  const { doctors } = useLookups();
  const [form, setForm] = useState<RuleForm | null>(null);

  const { data: rules = [], isLoading } = useQuery({ queryKey: ["compensation-rules"], queryFn: () => financeApi.rules() });

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; rules: CompensationRule[] }>();
    for (const r of rules) {
      const g = map.get(r.doctor_id) ?? { name: r.doctor?.full_name ?? "-", rules: [] };
      g.rules.push(r);
      map.set(r.doctor_id, g);
    }
    return [...map.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, "ar"));
  }, [rules]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["compensation-rules"] });
    queryClient.invalidateQueries({ queryKey: ["settlement"] });
  };
  const save = useMutation({
    mutationFn: (f: RuleForm) =>
      financeApi.addRule({
        doctor_id: f.doctor_id,
        specialty_id: f.specialty_id === "all" ? null : f.specialty_id,
        percent: Number(f.percent),
        effective_from: f.effective_from,
        notes: f.notes.trim() || null,
      }),
    onSuccess: () => {
      refresh();
      setForm(null);
      toast({ title: "تم الحفظ", description: "تمت إضافة النسبة" });
    },
    onError: errorToast,
  });
  const remove = useMutation({
    mutationFn: (id: string) => financeApi.removeRule(id),
    onSuccess: () => {
      refresh();
      toast({ title: "تم الحذف", description: "تم حذف النسبة" });
    },
    onError: errorToast,
  });

  const submit = () => {
    if (!form) return;
    const p = Number(form.percent);
    if (!form.doctor_id) return toast({ title: "تنبيه", description: "اختر الطبيب", variant: "destructive" });
    if (form.percent === "" || Number.isNaN(p) || p < 0 || p > 100)
      return toast({ title: "تنبيه", description: "النسبة بين 0 و 100", variant: "destructive" });
    if (!form.effective_from) return toast({ title: "تنبيه", description: "حدد تاريخ البداية", variant: "destructive" });
    save.mutate(form);
  };

  const doctorSpecialties = doctors.find((d) => d.id === form?.doctor_id)?.specialties ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle>نسب الأطباء</CardTitle>
          <CardDescription>إضافة نسبة جديدة تُنهي النسبة السابقة للطبيب نفسه تلقائياً؛ الأشهر السابقة لا تتأثر.</CardDescription>
        </div>
        <Button
          onClick={() =>
            setForm({ doctor_id: "", specialty_id: "all", percent: "", effective_from: format(new Date(), "yyyy-MM-01"), notes: "" })
          }
        >
          <Plus className="h-4 w-4 ml-2" />
          إضافة نسبة
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="text-center py-8">جاري التحميل...</div>
        ) : !grouped.length ? (
          <div className="text-center py-8 text-muted-foreground">لم تُحدد نسب بعد</div>
        ) : (
          grouped.map(([doctorId, g]) => (
            <div key={doctorId} className="space-y-2">
              <h3 className="font-semibold">{g.name}</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>النسبة</TableHead>
                      <TableHead>التخصص</TableHead>
                      <TableHead>من</TableHead>
                      <TableHead>إلى</TableHead>
                      <TableHead>ملاحظات</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.rules.map((r) => (
                      <TableRow key={r.id} className={r.effective_to ? "text-muted-foreground" : ""}>
                        <TableCell className="font-semibold">{Number(r.percent)}%</TableCell>
                        <TableCell>{r.specialty?.name_ar ?? "كل التخصصات"}</TableCell>
                        <TableCell>{r.effective_from?.slice(0, 10)}</TableCell>
                        <TableCell>{r.effective_to ? r.effective_to.slice(0, 10) : <Badge variant="outline">سارية</Badge>}</TableCell>
                        <TableCell className="max-w-xs truncate">{r.notes ?? ""}</TableCell>
                        <TableCell>
                          <DeleteButton title="حذف هذه النسبة؟" onConfirm={() => remove.mutate(r.id)} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))
        )}
      </CardContent>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة نسبة</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-4">
              <div>
                <Label>الطبيب</Label>
                <DoctorSelect doctors={doctors} value={form.doctor_id} onChange={(v) => setForm({ ...form, doctor_id: v, specialty_id: "all" })} />
              </div>
              <div>
                <Label>التخصص</Label>
                <Select value={form.specialty_id} onValueChange={(v) => setForm({ ...form, specialty_id: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل التخصصات</SelectItem>
                    {doctorSpecialties.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name_ar}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="rule_pct">النسبة %</Label>
                  <Input id="rule_pct" type="number" min="0" max="100" step="any" value={form.percent} onChange={(e) => setForm({ ...form, percent: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="rule_from">اعتباراً من</Label>
                  <Input id="rule_from" type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
                </div>
              </div>
              <div>
                <Label htmlFor="rule_notes">ملاحظات</Label>
                <Textarea id="rule_notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setForm(null)}>
              إلغاء
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// e) payouts
// ---------------------------------------------------------------------------

interface PayoutForm {
  doctor_id: string;
  period: string;
  amount: string;
  currency: Currency;
  paid_at: string;
  notes: string;
}

const emptyPayout = (): PayoutForm => ({ doctor_id: "", period: prevMonth(), amount: "", currency: "SYP", paid_at: today(), notes: "" });

function PayoutDialog({ form, setForm }: { form: PayoutForm | null; setForm: (f: PayoutForm | null) => void }) {
  const queryClient = useQueryClient();
  const { doctors } = useLookups();
  const save = useMutation({
    mutationFn: (f: PayoutForm) =>
      financeApi.addPayout({
        doctor_id: f.doctor_id,
        period: f.period || null,
        amount: Number(f.amount),
        currency: f.currency,
        paid_at: f.paid_at,
        notes: f.notes.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payouts"] });
      queryClient.invalidateQueries({ queryKey: ["settlement"] });
      setForm(null);
      toast({ title: "تم الحفظ", description: "تم تسجيل الدفعة" });
    },
    onError: errorToast,
  });

  const submit = () => {
    if (!form) return;
    if (!form.doctor_id) return toast({ title: "تنبيه", description: "اختر الطبيب", variant: "destructive" });
    if (!(Number(form.amount) > 0)) return toast({ title: "تنبيه", description: "أدخل مبلغاً أكبر من صفر", variant: "destructive" });
    if (!form.paid_at) return toast({ title: "تنبيه", description: "حدد تاريخ الدفع", variant: "destructive" });
    save.mutate(form);
  };

  return (
    <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>تسجيل دفعة للطبيب</DialogTitle>
        </DialogHeader>
        {form && (
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>الطبيب</Label>
              <DoctorSelect doctors={doctors} value={form.doctor_id} onChange={(v) => setForm({ ...form, doctor_id: v })} />
            </div>
            <div>
              <Label htmlFor="pay_period">عن شهر</Label>
              <Input id="pay_period" type="month" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="pay_date">تاريخ الدفع</Label>
              <Input id="pay_date" type="date" value={form.paid_at} onChange={(e) => setForm({ ...form, paid_at: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="pay_amount">المبلغ</Label>
              <Input id="pay_amount" type="number" min="0" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <Label>العملة</Label>
              <CurrencySelect value={form.currency} onChange={(currency) => setForm({ ...form, currency })} />
            </div>
            <div className="col-span-2">
              <Label htmlFor="pay_notes">ملاحظات</Label>
              <Textarea id="pay_notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setForm(null)}>
            إلغاء
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayoutsTab({ onPayout }: { onPayout: (f: PayoutForm) => void }) {
  const queryClient = useQueryClient();
  const { doctors } = useLookups();
  const [period, setPeriod] = useState("");
  const [doctorId, setDoctorId] = useState("all");

  const params = { period: period || undefined, doctor_id: doctorId === "all" ? undefined : doctorId };
  const { data: rows = [], isLoading } = useQuery({ queryKey: ["payouts", params], queryFn: () => financeApi.payouts(params) });

  const remove = useMutation({
    mutationFn: (id: string) => financeApi.removePayout(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payouts"] });
      queryClient.invalidateQueries({ queryKey: ["settlement"] });
      toast({ title: "تم الحذف", description: "تم حذف الدفعة" });
    },
    onError: errorToast,
  });

  const totals = CURRENCIES.map((c) => ({ c, sum: rows.filter((r) => r.currency === c).reduce((s, r) => s + Number(r.amount), 0) })).filter((t) => t.sum > 0);

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <CardTitle>دفعات الأطباء</CardTitle>
          <Button onClick={() => onPayout({ ...emptyPayout(), period: period || prevMonth(), doctor_id: doctorId === "all" ? "" : doctorId })}>
            <Plus className="h-4 w-4 ml-2" />
            تسجيل دفعة
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <Label htmlFor="payout_period">الشهر</Label>
            <div className="flex gap-2">
              <Input id="payout_period" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-44" />
              {period && (
                <Button variant="ghost" size="sm" onClick={() => setPeriod("")}>
                  كل الأشهر
                </Button>
              )}
            </div>
          </div>
          <div className="w-56">
            <Label>الطبيب</Label>
            <Select value={doctorId} onValueChange={setDoctorId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأطباء</SelectItem>
                {doctors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {totals.map((t) => (
            <Badge key={t.c} variant="secondary" className="h-8 text-sm">
              المجموع: {money(t.sum, t.c)}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {isLoading ? (
          <div className="text-center py-8">جاري التحميل...</div>
        ) : !rows.length ? (
          <div className="text-center py-8 text-muted-foreground">لا توجد دفعات</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>تاريخ الدفع</TableHead>
                <TableHead>الطبيب</TableHead>
                <TableHead>عن شهر</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>ملاحظات</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="whitespace-nowrap">{p.paid_at?.slice(0, 10)}</TableCell>
                  <TableCell className="font-medium">{p.doctor?.full_name ?? "-"}</TableCell>
                  <TableCell>{p.period ?? "—"}</TableCell>
                  <TableCell className="font-semibold whitespace-nowrap">{money(p.amount, p.currency)}</TableCell>
                  <TableCell className="max-w-xs truncate">{p.notes ?? ""}</TableCell>
                  <TableCell>
                    <DeleteButton title="حذف هذه الدفعة؟" onConfirm={() => remove.mutate(p.id)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
