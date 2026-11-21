import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { activityLogsApi, type ActivityEvent } from "@/api/clinic";

const PER_PAGE = 20;

const EVENT_STYLE: Record<ActivityEvent, { label: string; className: string }> = {
  created: { label: "إضافة", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  updated: { label: "تعديل", className: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  deleted: { label: "حذف", className: "bg-red-500/10 text-red-700 dark:text-red-300" },
  imported: { label: "استيراد", className: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
};

/**
 * سجل التغييرات of one patient (plan §2.5): every logged action that
 * concerns this patient — appointments, treatments, payments, data edits.
 * Shown to the admin only (the log contains every doctor's money).
 */
export function PatientActivityHistory({ patientId }: { patientId: string }) {
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ["patient-activity", patientId, page],
    queryFn: () => activityLogsApi.list({ patient_id: patientId, page, per_page: PER_PAGE }),
    placeholderData: keepPreviousData,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          سجل التغييرات
        </CardTitle>
        <p className="text-sm text-muted-foreground">كل ما تم على هذا المريض: من قام به ومتى</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : isError ? (
          <p className="text-center py-8 text-destructive">تعذر تحميل السجل</p>
        ) : !data?.data.length ? (
          <div className="text-center py-8 text-muted-foreground">
            <History className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p>لا توجد تغييرات مسجلة لهذا المريض بعد</p>
            <p className="text-xs mt-1">يبدأ السجل من تاريخ الانتقال إلى النظام الجديد</p>
          </div>
        ) : (
          <>
            <ol className={cn("space-y-2", isFetching && "opacity-60")}>
              {data.data.map((e) => {
                const style = EVENT_STYLE[e.event] ?? EVENT_STYLE.updated;
                return (
                  <li
                    key={e.id}
                    className={cn(
                      "rounded-md border p-3 text-sm",
                      (e.is_money || e.event === "deleted") && "border-amber-300 bg-amber-50/50 dark:bg-amber-500/5",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={cn("rounded px-2 py-0.5 text-xs font-medium", style.className)}>{style.label}</span>
                      {e.is_money && <Badge variant="outline" className="text-xs">مالي</Badge>}
                      <span className="text-xs text-muted-foreground" dir="ltr">
                        {format(new Date(e.created_at), "yyyy-MM-dd HH:mm")}
                      </span>
                    </div>
                    <p className="leading-relaxed">{e.description}</p>
                  </li>
                );
              })}
            </ol>
            {data.last_page > 1 && (
              <div className="flex items-center justify-between mt-4">
                <span className="text-xs text-muted-foreground">
                  صفحة {data.current_page} من {data.last_page} ({data.total} عملية)
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    السابق
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= data.last_page} onClick={() => setPage((p) => p + 1)}>
                    التالي
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
