import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { Banknote, CalendarClock, CheckCircle2, FileImage, FileText, ScrollText, Stethoscope, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { patientFilesApi, timelineApi, type TimelineEvent } from "@/api/clinic";

const ALL = "all";

const TYPES: Record<TimelineEvent["type"], { label: string; icon: LucideIcon; dot: string }> = {
  appointment: { label: "المواعيد", icon: CalendarClock, dot: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  treatment: { label: "العلاجات", icon: Stethoscope, dot: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  prescription: { label: "الوصفات", icon: ScrollText, dot: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  file: { label: "الملفات", icon: FileImage, dot: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  payment: { label: "الدفعات", icon: Banknote, dot: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
};

const money = (n: number, cur: "SYP" | "USD") => (cur === "USD" ? `$${n.toLocaleString("en-US")}` : `${Math.round(n).toLocaleString("en-US")} ل.س`);

/**
 * السجل الطبي (plan §2.4): visits, treatments, prescriptions, files and
 * payments of one patient in one chronological list, filterable by specialty.
 */
export function PatientTimeline({ patientId }: { patientId: string }) {
  const [specialty, setSpecialty] = useState(ALL);
  const [hidden, setHidden] = useState<Set<TimelineEvent["type"]>>(new Set());

  const { data, isLoading, isError } = useQuery({
    queryKey: ["patient-timeline", patientId, specialty],
    queryFn: () => timelineApi.get(patientId, { specialty_id: specialty === ALL ? undefined : specialty }),
  });

  const events = useMemo(() => (data?.data ?? []).filter((e) => !hidden.has(e.type)), [data, hidden]);

  // Group by local day.
  const days = useMemo(() => {
    const groups: { key: string; label: string; items: TimelineEvent[] }[] = [];
    for (const e of events) {
      const d = new Date(e.at);
      const key = format(d, "yyyy-MM-dd");
      const last = groups[groups.length - 1];
      if (last?.key === key) last.items.push(e);
      else groups.push({ key, label: format(d, "EEEE d MMMM yyyy", { locale: ar }), items: [e] });
    }
    return groups;
  }, [events]);

  const counts = useMemo(() => {
    const c: Partial<Record<TimelineEvent["type"], number>> = {};
    for (const e of data?.data ?? []) c[e.type] = (c[e.type] ?? 0) + 1;
    return c;
  }, [data]);

  const toggle = (t: TimelineEvent["type"]) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });

  return (
    <Card>
      <CardHeader className="space-y-3">
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          السجل الطبي
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {(data?.specialties.length ?? 0) > 0 && (
            <Select value={specialty} onValueChange={setSpecialty}>
              <SelectTrigger className="w-48 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>كل التخصصات</SelectItem>
                {data!.specialties.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {(Object.keys(TYPES) as TimelineEvent["type"][]).map((t) => {
            const T = TYPES[t];
            const off = hidden.has(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggle(t)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors",
                  off ? "opacity-50 line-through" : "bg-accent",
                )}
              >
                <T.icon className="h-3.5 w-3.5" />
                {T.label}
                <span className="text-muted-foreground">({counts[t] ?? 0})</span>
              </button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : isError ? (
          <p className="py-8 text-center text-destructive">تعذر تحميل السجل الطبي</p>
        ) : days.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">لا توجد أحداث</p>
        ) : (
          <div className="space-y-6">
            {days.map((day) => (
              <section key={day.key}>
                <h3 className="sticky top-14 z-[1] mb-2 bg-card/95 py-1 text-sm font-semibold text-muted-foreground backdrop-blur">
                  {day.label}
                </h3>
                <ol className="relative space-y-3 border-s ps-6">
                  {day.items.map((e) => {
                    const T = TYPES[e.type];
                    return (
                      <li key={`${e.type}-${e.id}`} className="relative">
                        <span className={cn("absolute -start-[37px] top-1 grid h-7 w-7 place-items-center rounded-full ring-4 ring-card", T.dot)}>
                          <T.icon className="h-3.5 w-3.5" />
                        </span>
                        <div className="rounded-md border p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{e.title}</span>
                            {e.type === "treatment" && e.completed && <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="مكتمل" />}
                            {e.type === "treatment" && e.completed === false && <Badge variant="outline" className="text-xs">غير مكتمل</Badge>}
                            {e.type === "appointment" && e.status === "Cancelled" && <Badge variant="outline" className="text-xs">ملغى</Badge>}
                            {e.specialty && (
                              <Badge
                                variant="secondary"
                                className="text-xs"
                                style={e.specialty.color ? { backgroundColor: `${e.specialty.color}22`, color: e.specialty.color } : undefined}
                              >
                                {e.specialty.name}
                              </Badge>
                            )}
                            <span className="ms-auto text-xs text-muted-foreground" dir="ltr">{format(new Date(e.at), "HH:mm")}</span>
                          </div>
                          {(e.doctor || (e.type === "treatment" && (e.amount_syp || e.amount_usd))) && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {e.doctor}
                              {e.type === "treatment" && (e.amount_syp || e.amount_usd) ? (
                                <>
                                  {e.doctor ? " · " : ""}الكلفة: {[e.amount_syp ? money(e.amount_syp, "SYP") : null, e.amount_usd ? money(e.amount_usd, "USD") : null].filter(Boolean).join(" + ")}
                                </>
                              ) : null}
                            </p>
                          )}
                          {e.detail && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{e.detail}</p>}
                          {e.type === "file" && e.has_thumbnail && (
                            <a href={patientFilesApi.contentUrl(e.id)} target="_blank" rel="noreferrer" className="mt-2 inline-block">
                              <img src={patientFilesApi.thumbnailUrl(e.id)} alt="" loading="lazy" className="h-24 rounded border object-cover" />
                            </a>
                          )}
                          {e.type === "file" && !e.has_thumbnail && (
                            <a href={patientFilesApi.contentUrl(e.id)} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm text-primary underline">
                              فتح الملف
                            </a>
                          )}
                          {e.type === "prescription" && (
                            <a href={`/print/prescription/${e.id}`} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm text-primary underline">
                              عرض الوصفة
                            </a>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
