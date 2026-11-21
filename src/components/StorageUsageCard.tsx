import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, HardDrive } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { storageApi } from "@/api/clinic";

const size = (bytes: number | null) => {
  if (bytes == null) return "—";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  return mb >= 1 ? `${mb.toFixed(0)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

/** Patient files size + free disk space; warns before x-rays fill the hosting quota. */
export function StorageUsageCard() {
  const { data } = useQuery({ queryKey: ["storage-usage"], queryFn: storageApi.usage });
  if (!data) return null;

  return (
    <Card className={data.warning ? "border-amber-400" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <HardDrive className="h-5 w-5 text-primary" />
          مساحة التخزين
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {data.disk_used_percent != null && (
          <>
            <Progress value={data.disk_used_percent} />
            <p>
              المستخدم {data.disk_used_percent}% — المتبقي {size(data.disk_free_bytes)} من {size(data.disk_total_bytes)}
            </p>
          </>
        )}
        <p className="text-muted-foreground">
          ملفات المرضى: {data.files_count.toLocaleString("en-US")} ملف ({size(data.files_bytes)})
        </p>
        {data.warning && (
          <p className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            المساحة تجاوزت {data.warning_percent}%: نزّل نسخة من الملفات القديمة أو وسّع مساحة الاستضافة.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
