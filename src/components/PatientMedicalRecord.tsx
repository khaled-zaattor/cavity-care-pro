import { useQuery } from "@tanstack/react-query";
import { FileText, Pill, ScanLine } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { medicalApi, patientFilesApi, type PatientFile } from "@/api/clinic";
import { fmtDate } from "@/pages/patient-profile/utils";

const ECHOS = [
  { key: "echo_abdominal", label: "آخر إيكو بطن" },
  { key: "echo_gyn", label: "آخر إيكو نسائي" },
] as const;

function EchoTile({ label, file }: { label: string; file: PatientFile | null | undefined }) {
  if (!file) {
    return (
      <div className="rounded-lg border border-dashed p-3 text-center">
        <div className="text-sm font-medium">{label}</div>
        <div className="mt-6 mb-6 text-xs text-muted-foreground">لا توجد صورة. ارفعها من «ملفات المريض» بتصنيف «{label.replace("آخر ", "")}».</div>
      </div>
    );
  }
  const src = file.has_thumbnail ? patientFilesApi.thumbnailUrl(file.id) : patientFilesApi.contentUrl(file.id);
  return (
    <a
      href={patientFilesApi.contentUrl(file.id)}
      target="_blank"
      rel="noreferrer"
      className="block rounded-lg border p-3 hover:bg-accent/40 transition-colors"
      title="فتح الصورة"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{fmtDate(file.taken_at ?? file.created_at)}</span>
      </div>
      <div className="mt-2 flex h-40 items-center justify-center overflow-hidden rounded-md bg-muted">
        {file.is_image ? (
          <img src={src} alt={file.title} className="h-full w-full object-contain" loading="lazy" />
        ) : (
          <FileText className="h-10 w-10 text-muted-foreground" />
        )}
      </div>
      <div className="mt-1 truncate text-xs text-muted-foreground">{file.title}</div>
    </a>
  );
}

/** السجل الطبي: latest abdominal / gynecological echo and the medicines the patient took, by date. */
export function PatientMedicalRecord({ patientId, showEcho }: { patientId: string; showEcho: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["medical-summary", patientId],
    queryFn: () => medicalApi.summary(patientId),
  });
  const medications = data?.medications ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ScanLine className="h-5 w-5 text-primary" />
          السجل الطبي
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {showEcho && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ECHOS.map((e) => (
              <EchoTile key={e.key} label={e.label} file={data?.latest_echo?.[e.key]} />
            ))}
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Pill className="h-4 w-4" />
            الأدوية التي أخذها المريض
          </div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">جاري التحميل...</p>
          ) : medications.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد أدوية في وصفات هذا المريض.</p>
          ) : (
            <div className="max-h-80 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">الدواء</TableHead>
                    <TableHead className="text-right">الجرعة</TableHead>
                    <TableHead className="text-right">المدة</TableHead>
                    <TableHead className="text-right">الطبيب</TableHead>
                    <TableHead className="text-right">الوصفة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {medications.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap">{fmtDate(m.issued_at)}</TableCell>
                      <TableCell className="font-medium" dir="auto">
                        {m.medicine_name}
                        {m.instructions && <div className="text-xs text-muted-foreground">{m.instructions}</div>}
                      </TableCell>
                      <TableCell>{[m.dose, m.frequency].filter(Boolean).join(" — ") || "-"}</TableCell>
                      <TableCell>{m.duration || "-"}</TableCell>
                      <TableCell>{m.doctor_name || "-"}</TableCell>
                      <TableCell>
                        <a className="text-primary hover:underline" href={`/print/prescription/${m.prescription_id}`} target="_blank" rel="noreferrer">
                          #{m.prescription_number}
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
