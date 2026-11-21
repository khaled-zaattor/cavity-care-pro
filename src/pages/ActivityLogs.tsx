import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { format, isToday, isYesterday, startOfMonth, subDays } from "date-fns";
import { ar } from "date-fns/locale";
import {
  Banknote,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileClock,
  FileText,
  FileUp,
  FolderOpen,
  ListOrdered,
  Pencil,
  Settings2,
  Plus,
  Search,
  ShieldCheck,
  Stethoscope,
  Trash2,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  activityLogsApi,
  dayEndIso,
  dayStartIso,
  type ActivityEvent,
  type ActivityLogEntry,
  type ActivitySubject,
} from "@/api/clinic";

const ALL = "all";
const PER_PAGE = 50;
const ymd = (d: Date) => format(d, "yyyy-MM-dd");

const SUBJECTS: Record<ActivitySubject, { label: string; icon: LucideIcon }> = {
  appointment: { label: "المواعيد", icon: CalendarClock },
  payment: { label: "الدفعات", icon: Banknote },
  treatment_record: { label: "العلاجات", icon: Stethoscope },
  treatment_plan: { label: "خطط العلاج", icon: ClipboardList },
  patient: { label: "المرضى", icon: UserRound },
  doctor: { label: "الأطباء", icon: Stethoscope },
  user: { label: "المستخدمون", icon: ShieldCheck },
  treatment: { label: "قائمة العلاجات والأسعار", icon: ListOrdered },
  settings: { label: "التخصصات والصلاحيات", icon: Settings2 },
  prescription: { label: "الوصفات الطبية", icon: FileText },
  patient_file: { label: "ملفات المرضى", icon: FolderOpen },
};

const EVENTS: Record<ActivityEvent, { label: string; icon: LucideIcon; dot: string; chip: string }> = {
  created: {
    label: "إضافة",
    icon: Plus,
    dot: "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300",
    chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  updated: {
    label: "تعديل",
    icon: Pencil,
    dot: "bg-sky-500/15 text-sky-700 ring-sky-500/30 dark:text-sky-300",
    chip: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  deleted: {
    label: "حذف",
    icon: Trash2,
    dot: "bg-red-500/15 text-red-700 ring-red-500/30 dark:text-red-300",
    chip: "bg-red-500/10 text-red-700 dark:text-red-300",
  },
  imported: {
    label: "استيراد",
    icon: FileUp,
    dot: "bg-violet-500/15 text-violet-700 ring-violet-500/30 dark:text-violet-300",
    chip: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
};

/** Arabic labels for the old → new values stored with edits. */
const FIELD_LABELS: Record<string, string> = {
  amount: "المبلغ",
  status: "الحالة",
  scheduled_at: "الموعد",
  actual_cost_syp: "الكلفة (ل.س)",
  actual_cost_usd: "الكلفة ($)",
  is_completed: "مكتمل",
  treatment_notes: "ملاحظات العلاج",
  full_name: "الاسم",
  date_of_birth: "تاريخ الميلاد",
  phone_number: "الهاتف",
  address: "العنوان",
  contact: "جهة الاتصال",
  job: "المهنة",
  medical_notes: "الملاحظات الطبية",
  email: "البريد الإلكتروني",
  has_own_books: "حسابات مستقلة",
  role: "الدور",
  is_active: "الحساب",
  estimated_cost_syp: "السعر (ل.س)",
  estimated_cost_usd: "السعر ($)",
  name: "الاسم",
  name_ar: "الاسم",
  tooth_association: "الارتباط بالأسنان",
  specialty_id: "التخصص",
  is_dental: "تخصص أسنان",
  can_create: "الإضافة",
  can_update: "التعديل",
  can_delete: "الحذف",
};
const VALUE_LABELS: Record<string, Record<string, string>> = {
  status: { Scheduled: "مجدول", Completed: "مكتمل", Cancelled: "ملغى" },
  role: { super_admin: "مدير النظام", doctor: "طبيب", dentist_assistant: "مساعد طبيب", receptionist: "موظف استقبال" },
  is_active: { true: "فعّال", false: "موقوف" },
  tooth_association: { not_related: "غير مرتبط بسن", single_tooth: "سن واحد", multiple_teeth: "عدة أسنان" },
};

function showValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const key = String(value);
  if (VALUE_LABELS[field]?.[key]) return VALUE_LABELS[field][key];
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  if (typeof value === "number") return value.toLocaleString("en-US");
  return key;
}

function dayLabel(date: Date): string {
  if (isToday(date)) return "اليوم";
  if (isYesterday(date)) return "أمس";
  return format(date, "EEEE d MMMM yyyy", { locale: ar });
}

const QUICK_RANGES = [
  { key: "today", label: "اليوم", range: () => [ymd(new Date()), ymd(new Date())] },
  { key: "week", label: "آخر 7 أيام", range: () => [ymd(subDays(new Date(), 6)), ymd(new Date())] },
  { key: "month", label: "هذا الشهر", range: () => [ymd(startOfMonth(new Date())), ymd(new Date())] },
  { key: "all", label: "الكل", range: () => ["", ""] },
] as const;

/** سجل النشاطات: one readable sentence per action, written by the backend. */
export default function ActivityLogs() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState(ALL);
  const [subject, setSubject] = useState<string>(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [important, setImportant] = useState(false);
  const [page, setPage] = useState(1);

  // Wait for the user to stop typing before searching.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Any filter change goes back to page 1.
  useEffect(() => setPage(1), [search, userId, subject, from, to, important]);

  const { data: users } = useQuery({ queryKey: ["activity-log-users"], queryFn: activityLogsApi.users });

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ["activity-logs", search, userId, subject, from, to, important, page],
    queryFn: () =>
      activityLogsApi.list({
        search: search || undefined,
        user_id: userId === ALL ? undefined : userId,
        subject_type: subject === ALL ? undefined : (subject as ActivitySubject),
        from: from ? dayStartIso(from) : undefined,
        to: to ? dayEndIso(to) : undefined,
        important: important ? 1 : undefined,
        page,
        per_page: PER_PAGE,
      }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  // Group the page by local day for the timeline headers.
  const days = useMemo(() => {
    const groups: { key: string; label: string; entries: ActivityLogEntry[] }[] = [];
    for (const e of data?.data ?? []) {
      const d = new Date(e.created_at);
      const key = ymd(d);
      const last = groups[groups.length - 1];
      if (last?.key === key) last.entries.push(e);
      else groups.push({ key, label: dayLabel(d), entries: [e] });
    }
    return groups;
  }, [data]);

  const activeRange = QUICK_RANGES.find((r) => {
    const [f, t] = r.range();
    return f === from && t === to;
  })?.key;
  const hasFilters = !!(searchInput || userId !== ALL || subject !== ALL || from || to || important);

  const clearFilters = () => {
    setSearchInput("");
    setUserId(ALL);
    setSubject(ALL);
    setFrom("");
    setTo("");
    setImportant(false);
  };

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <FileClock className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold leading-tight">سجل النشاطات</h1>
            <p className="text-sm text-muted-foreground">من فعل ماذا ومتى: المواعيد والعلاجات والدفعات والمرضى والمستخدمون</p>
          </div>
        </div>
        {data && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {isFetching && !isLoading && <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />}
            <span>
              <span className="font-semibold text-foreground tabular-nums">{data.total.toLocaleString("en-US")}</span> عملية
            </span>
          </div>
        )}
      </div>

      {/* Filters */}
      <Card className="shadow-sm">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 ps-10 pe-10 text-base"
              placeholder="ابحث باسم مريض أو طبيب أو علاج أو مبلغ..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                className="absolute end-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted"
                aria-label="مسح البحث"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {QUICK_RANGES.map((r) => (
              <Button
                key={r.key}
                size="sm"
                variant={activeRange === r.key ? "default" : "outline"}
                className="rounded-full"
                onClick={() => {
                  const [f, t] = r.range();
                  setFrom(f);
                  setTo(t);
                }}
              >
                {r.label}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">المستخدم</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>جميع المستخدمين</SelectItem>
                  {users?.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">النوع</Label>
              <Select value={subject} onValueChange={setSubject}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>جميع الأنواع</SelectItem>
                  {(Object.keys(SUBJECTS) as ActivitySubject[]).map((s) => (
                    <SelectItem key={s} value={s}>{SUBJECTS[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="log_from" className="text-xs text-muted-foreground">من تاريخ</Label>
              
              <Input id="log_from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="log_to" className="text-xs text-muted-foreground">إلى تاريخ</Label>
              <Input id="log_to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <label htmlFor="log_important" className="flex cursor-pointer items-center gap-2.5 text-sm">
              <Switch id="log_important" checked={important} onCheckedChange={setImportant} />
              <span>المال والحذف فقط</span>
              <span className="text-xs text-muted-foreground">(العمليات التي تهم التدقيق)</span>
            </label>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                <X className="h-4 w-4" />
                مسح الفلاتر
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      {isLoading ? (
        <TimelineSkeleton />
      ) : isError ? (
        <EmptyState title="تعذر تحميل السجل" hint="تحقق من الاتصال بالخادم ثم أعد المحاولة" />
      ) : days.length === 0 ? (
        <EmptyState
          title={hasFilters ? "لا توجد عمليات مطابقة" : "لا توجد عمليات مسجلة بعد"}
          hint={hasFilters ? "جرّب تغيير الفلاتر أو مسحها" : "ستظهر هنا كل عملية فور حدوثها"}
        />
      ) : (
        <div className="space-y-6">
          {days.map((day) => (
            <section key={day.key}>
              <div className="sticky top-0 z-10 -mx-1 mb-2 flex items-center gap-3 bg-background/90 px-1 py-2 backdrop-blur">
                <h2 className="text-sm font-semibold">{day.label}</h2>
                <span className="text-xs text-muted-foreground tabular-nums" dir="ltr">{day.key}</span>
                <div className="h-px flex-1 bg-border" />
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {day.entries.length} عملية
                </span>
              </div>
              <Card className="overflow-hidden shadow-sm">
                <ol className="relative">
                  {day.entries.map((e, i) => (
                    <LogRow key={e.id} entry={e} last={i === day.entries.length - 1} />
                  ))}
                </ol>
              </Card>
            </section>
          ))}
        </div>
      )}

      {data && data.last_page > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronRight className="h-4 w-4" />
            الأحدث
          </Button>
          <span className="text-sm text-muted-foreground">
            صفحة <span className="tabular-nums">{data.current_page}</span> من <span className="tabular-nums">{data.last_page}</span>
          </span>
          <Button variant="outline" size="sm" disabled={page >= data.last_page} onClick={() => setPage((p) => p + 1)}>
            الأقدم
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function LogRow({ entry, last }: { entry: ActivityLogEntry; last: boolean }) {
  const [open, setOpen] = useState(false);
  const event = EVENTS[entry.event] ?? EVENTS.updated;
  const subject = SUBJECTS[entry.subject_type];
  const Icon = entry.event === "deleted" ? Trash2 : entry.event === "imported" ? FileUp : subject?.icon ?? event.icon;

  // Put the actor's name in bold: descriptions start with it.
  const actor = entry.user_name ?? "النظام";
  const rest = entry.description.startsWith(actor) ? entry.description.slice(actor.length) : null;

  const changes = Object.keys(entry.properties?.new ?? {}).filter((k) => FIELD_LABELS[k]);
  const accent =
    entry.event === "deleted"
      ? "bg-red-500/[0.04] before:bg-red-500"
      : entry.is_money
        ? "bg-amber-500/[0.05] before:bg-amber-500"
        : "before:bg-transparent";

  return (
    <li
      className={cn(
        "relative flex gap-3 px-4 py-3.5 transition-colors hover:bg-muted/40 sm:gap-4",
        "before:absolute before:inset-y-0 before:start-0 before:w-1",
        accent,
      )}
    >
      {/* icon + vertical line */}
      <div className="relative flex flex-col items-center">
        <div className={cn("z-[1] grid h-9 w-9 shrink-0 place-items-center rounded-full ring-1", event.dot)}>
          <Icon className="h-4 w-4" />
        </div>
        {!last && <div className="absolute top-9 -bottom-3.5 w-px bg-border" />}
      </div>

      <div className="min-w-0 flex-1 space-y-1.5 pt-1">
        <p className="text-[15px] leading-7 break-words">
          {rest !== null ? (
            <>
              <span className="font-semibold">{actor}</span>
              {rest}
            </>
          ) : (
            entry.description
          )}
        </p>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground tabular-nums" dir="ltr">
            {format(new Date(entry.created_at), "HH:mm")}
          </span>
          <span className="text-muted-foreground/50">•</span>
          <Badge variant="secondary" className={cn("border-0 px-2 py-0 font-normal", event.chip)}>
            {event.label}
          </Badge>
          {subject && (
            <Badge variant="outline" className="px-2 py-0 font-normal">
              {subject.label}
            </Badge>
          )}
          {entry.is_money && (
            <Badge variant="outline" className="border-amber-500/40 px-2 py-0 font-normal text-amber-700 dark:text-amber-300">
              مالي
            </Badge>
          )}
          {changes.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="ms-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {open ? "إخفاء التفاصيل" : "التفاصيل"}
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
            </button>
          )}
        </div>

        {open && changes.length > 0 && (
          <div className="mt-2 overflow-hidden rounded-lg border bg-muted/30 text-sm">
            <div className="grid grid-cols-[minmax(6rem,auto)_1fr_1fr] gap-x-4 border-b bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <span>الحقل</span>
              <span>قبل</span>
              <span>بعد</span>
            </div>
            {changes.map((k) => (
              <div key={k} className="grid grid-cols-[minmax(6rem,auto)_1fr_1fr] gap-x-4 px-3 py-1.5 [&:not(:last-child)]:border-b">
                <span className="text-muted-foreground">{FIELD_LABELS[k]}</span>
                <span className="break-words text-red-700/80 line-through decoration-red-500/40 dark:text-red-300/80">
                  {showValue(k, entry.properties?.old?.[k])}
                </span>
                <span className="break-words font-medium text-emerald-700 dark:text-emerald-300">
                  {showValue(k, entry.properties?.new?.[k])}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <Card className="border-dashed shadow-none">
      <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
          <FileClock className="h-6 w-6" />
        </div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function TimelineSkeleton() {
  return (
    <Card className="shadow-sm">
      <div className="divide-y">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-4">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-2 pt-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
