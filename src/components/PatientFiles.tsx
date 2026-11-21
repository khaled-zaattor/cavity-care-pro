import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ar } from "date-fns/locale";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Download,
  Edit,
  ExternalLink,
  FileText,
  FolderOpen,
  RotateCw,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { toast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { apiErrorMessage, patientFilesApi, type PatientFile, type PatientFileCategory } from "@/api/clinic";

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const ALLOWED_EXT = ["jpg", "jpeg", "png", "webp", "pdf"];

const FALLBACK_CATEGORIES: Record<PatientFileCategory, string> = {
  xray: "صورة أشعة",
  radiology: "تصوير شعاعي",
  lab_test: "تحليل مخبري",
  report: "تقرير",
  photo: "صورة",
  prescription_scan: "وصفة ممسوحة",
  other: "أخرى",
};

const todayStr = () => format(new Date(), "yyyy-MM-dd");
const fileDay = (f: PatientFile) => f.taken_at ?? f.created_at.slice(0, 10);
const isPdf = (f: PatientFile) => !f.is_image;

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function safeFormat(day: string, pattern: string) {
  try {
    return format(parseISO(day), pattern, { locale: ar });
  } catch {
    return day;
  }
}

function imageSrc(f: PatientFile) {
  return f.has_thumbnail ? patientFilesApi.thumbnailUrl(f.id) : patientFilesApi.contentUrl(f.id);
}

// ---------------------------------------------------------------------------
// Zoomable image (shared by the viewer and the compare dialog)
// ---------------------------------------------------------------------------

function ZoomableImage({ src, alt, heightClass, allowRotate = false }: { src: string; alt: string; heightClass: string; allowRotate?: boolean }) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    setScale(1);
    setRotation(0);
  }, [src]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-center gap-1">
        <Button size="sm" variant="outline" onClick={() => setScale((s) => Math.max(1, +(s - 0.5).toFixed(1)))} disabled={scale <= 1} title="تصغير">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="w-12 text-center text-sm tabular-nums" dir="ltr">{scale.toFixed(1)}x</span>
        <Button size="sm" variant="outline" onClick={() => setScale((s) => Math.min(4, +(s + 0.5).toFixed(1)))} disabled={scale >= 4} title="تكبير">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => { setScale(1); setRotation(0); }} title="إعادة الضبط">
          1:1
        </Button>
        {allowRotate && (
          <Button size="sm" variant="outline" onClick={() => setRotation((r) => (r + 90) % 360)} title="تدوير">
            <RotateCw className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className={`overflow-auto rounded-md border bg-muted/40 ${heightClass}`} dir="ltr">
        <div
          className="flex min-h-full min-w-full items-center justify-center"
          style={{ width: `${scale * 100}%`, height: `${scale * 100}%` }}
        >
          <img
            src={src}
            alt={alt}
            className="max-h-full max-w-full object-contain transition-transform duration-150"
            style={{ transform: `rotate(${rotation}deg)` }}
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface PendingFile {
  file: File;
  error: string | null;
}

/** الملفات والصور section of the patient profile. */
export function PatientFiles({ patientId }: { patientId: string }) {
  const queryClient = useQueryClient();
  const { userRole } = useUserRole();
  const canUpdate = userRole === "super_admin" || userRole === "doctor" || userRole === "dentist_assistant";
  const canDelete = userRole === "super_admin" || userRole === "doctor";

  const queryKey = useMemo(() => ["patient-files", patientId], [patientId]);
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => patientFilesApi.list(patientId),
  });

  const files = useMemo(() => data?.data ?? [], [data]);
  const categories = data?.categories ?? FALLBACK_CATEGORIES;
  const maxMb = data?.max_upload_mb ?? 20;
  const catLabel = (c: PatientFileCategory) => categories[c] ?? c;

  // ---- filter -------------------------------------------------------------
  const [filter, setFilter] = useState<PatientFileCategory | "all">("all");
  const counts = useMemo(() => {
    const m = new Map<PatientFileCategory, number>();
    files.forEach((f) => m.set(f.category, (m.get(f.category) ?? 0) + 1));
    return m;
  }, [files]);

  useEffect(() => {
    if (filter !== "all" && !counts.get(filter)) setFilter("all");
  }, [counts, filter]);

  const visible = useMemo(() => {
    const list = filter === "all" ? files : files.filter((f) => f.category === filter);
    return [...list].sort((a, b) => {
      const d = fileDay(b).localeCompare(fileDay(a));
      return d !== 0 ? d : b.created_at.localeCompare(a.created_at);
    });
  }, [files, filter]);

  const groups = useMemo(() => {
    const months: { month: string; days: { day: string; items: PatientFile[] }[] }[] = [];
    visible.forEach((f) => {
      const day = fileDay(f);
      const month = day.slice(0, 7);
      let m = months[months.length - 1];
      if (!m || m.month !== month) {
        m = { month, days: [] };
        months.push(m);
      }
      let d = m.days[m.days.length - 1];
      if (!d || d.day !== day) {
        d = { day, items: [] };
        m.days.push(d);
      }
      d.items.push(f);
    });
    return months;
  }, [visible]);

  // ---- upload -------------------------------------------------------------
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [batchCategory, setBatchCategory] = useState<PatientFileCategory>("xray");
  const [batchDate, setBatchDate] = useState(todayStr());
  const [batchTitle, setBatchTitle] = useState("");
  const [batchNotes, setBatchNotes] = useState("");
  const [uploading, setUploading] = useState<{ current: number; total: number } | null>(null);

  const validate = useCallback(
    (file: File): string | null => {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!ALLOWED_MIMES.includes(file.type) && !ALLOWED_EXT.includes(ext)) {
        return "نوع الملف غير مدعوم (المسموح: JPG, PNG, WEBP, PDF)";
      }
      if (file.size > maxMb * 1024 * 1024) {
        return `حجم الملف أكبر من الحد المسموح (${maxMb} MB)`;
      }
      return null;
    },
    [maxMb],
  );

  const addFiles = (list: FileList | File[] | null) => {
    if (!list || list.length === 0) return;
    const added = Array.from(list).map((file) => ({ file, error: validate(file) }));
    setPending((p) => [...p, ...added]);
  };

  const resetBatch = () => {
    setPending([]);
    setBatchTitle("");
    setBatchNotes("");
    setBatchDate(todayStr());
  };

  const validPending = pending.filter((p) => !p.error);

  const startUpload = async () => {
    const toUpload = validPending.map((p) => p.file);
    if (toUpload.length === 0) return;
    let ok = 0;
    const failures: string[] = [];
    for (let i = 0; i < toUpload.length; i++) {
      const file = toUpload[i];
      setUploading({ current: i + 1, total: toUpload.length });
      try {
        await patientFilesApi.upload(patientId, file, {
          category: batchCategory,
          title: toUpload.length === 1 && batchTitle.trim() ? batchTitle.trim() : file.name.replace(/\.[^.]+$/, ""),
          taken_at: batchDate || undefined,
          notes: batchNotes.trim() || undefined,
        });
        ok++;
      } catch (e) {
        failures.push(`${file.name}: ${apiErrorMessage(e)}`);
      }
    }
    setUploading(null);
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["patient-timeline", patientId] });
    const skipped = pending.length - toUpload.length;
    if (failures.length === 0) {
      toast({ title: ok === 1 ? "تم رفع الملف" : `تم رفع ${ok} ملفات`, description: skipped ? `تم تجاهل ${skipped} ملف غير صالح` : undefined });
    } else {
      toast({
        title: `تم رفع ${ok} من ${toUpload.length}`,
        description: failures.join("\n"),
        variant: "destructive",
      });
    }
    resetBatch();
  };

  // ---- selection / compare -----------------------------------------------
  const [selected, setSelected] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  useEffect(() => {
    setSelected((s) => s.filter((id) => files.some((f) => f.id === id)));
  }, [files]);
  const toggleSelect = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 2 ? [s[1], id] : [...s, id]));
  const compareFiles = selected.map((id) => files.find((f) => f.id === id)).filter((f): f is PatientFile => !!f);

  // ---- viewer ---------------------------------------------------------------
  const [viewerId, setViewerId] = useState<string | null>(null);
  const viewerIndex = viewerId ? visible.findIndex((f) => f.id === viewerId) : -1;
  const viewing = viewerIndex >= 0 ? visible[viewerIndex] : null;
  const [editMode, setEditMode] = useState(false);
  const [edit, setEdit] = useState({ title: "", category: "xray" as PatientFileCategory, taken_at: "", notes: "" });

  const go = useCallback(
    (delta: number) => {
      if (viewerIndex < 0 || visible.length === 0) return;
      const next = (viewerIndex + delta + visible.length) % visible.length;
      setViewerId(visible[next].id);
      setEditMode(false);
    },
    [viewerIndex, visible],
  );

  useEffect(() => {
    if (!viewing || editMode) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      // RTL: the left arrow moves forward (to the next/older file).
      if (e.key === "ArrowLeft") go(1);
      else if (e.key === "ArrowRight") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewing, editMode, go]);

  useEffect(() => {
    if (viewerId && viewerIndex < 0) setViewerId(null);
  }, [viewerId, viewerIndex]);

  const openEdit = (f: PatientFile) => {
    setEdit({ title: f.title, category: f.category, taken_at: f.taken_at ?? "", notes: f.notes ?? "" });
    setEditMode(true);
  };

  const update = useMutation({
    mutationFn: (v: { id: string; body: Partial<Pick<PatientFile, "category" | "title" | "taken_at" | "notes">> }) =>
      patientFilesApi.update(v.id, v.body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["patient-timeline", patientId] });
      setEditMode(false);
      toast({ title: "تم حفظ التعديلات" });
    },
    onError: (e) => toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => patientFilesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["patient-timeline", patientId] });
      setViewerId(null);
      toast({ title: "تم حذف الملف" });
    },
    onError: (e) => toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" }),
  });

  // ---------------------------------------------------------------------------

  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            الملفات والصور
          </span>
          {compareFiles.length === 2 && compareFiles.every((f) => f.is_image) && (
            <Button size="sm" variant="outline" onClick={() => setCompareOpen(true)}>
              <Columns2 className="h-4 w-4 ms-1" />
              مقارنة
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload area */}
        <div
          className={`rounded-lg border-2 border-dashed p-4 text-center transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (!uploading) addFiles(e.dataTransfer.files);
          }}
        >
          <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">اسحب الملفات وأفلتها هنا</p>
          <p className="mb-3 text-xs text-muted-foreground">JPG, PNG, WEBP, PDF — حتى {maxMb} MB للملف</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={!!uploading} onClick={() => fileInputRef.current?.click()}>
              <FolderOpen className="h-4 w-4 ms-1" />
              اختيار ملفات
            </Button>
            <Button type="button" variant="outline" size="sm" className="md:hidden" disabled={!!uploading} onClick={() => cameraInputRef.current?.click()}>
              <Camera className="h-4 w-4 ms-1" />
              التقاط صورة
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {/* Batch form */}
        {pending.length > 0 && (
          <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
            <ul className="space-y-1 text-sm">
              {pending.map((p, i) => (
                <li key={`${p.file.name}-${i}`} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {p.file.name} <span className="text-xs text-muted-foreground" dir="ltr">({formatSize(p.file.size)})</span>
                    {p.error && <span className="block text-xs text-destructive">{p.error}</span>}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    disabled={!!uploading}
                    onClick={() => setPending((list) => list.filter((_, j) => j !== i))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>التصنيف</Label>
                <Select value={batchCategory} onValueChange={(v) => setBatchCategory(v as PatientFileCategory)} dir="rtl">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(categories) as PatientFileCategory[]).map((c) => (
                      <SelectItem key={c} value={c}>{categories[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>تاريخ الصورة / الفحص</Label>
                <Input type="date" value={batchDate} max={todayStr()} onChange={(e) => setBatchDate(e.target.value)} />
              </div>
              {validPending.length === 1 && (
                <div className="space-y-1 sm:col-span-2">
                  <Label>العنوان (اختياري)</Label>
                  <Input value={batchTitle} onChange={(e) => setBatchTitle(e.target.value)} placeholder={validPending[0].file.name} maxLength={255} />
                </div>
              )}
              <div className="space-y-1 sm:col-span-2">
                <Label>ملاحظات (اختياري)</Label>
                <Textarea value={batchNotes} onChange={(e) => setBatchNotes(e.target.value)} rows={2} maxLength={2000} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={startUpload} disabled={!!uploading || validPending.length === 0}>
                <Upload className="h-4 w-4 ms-1" />
                {uploading ? `جاري رفع ${uploading.current} من ${uploading.total}…` : `رفع ${validPending.length} ملف`}
              </Button>
              <Button type="button" variant="outline" onClick={resetBatch} disabled={!!uploading}>
                إلغاء
              </Button>
            </div>
          </div>
        )}

        {/* Filter chips */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={filter === "all" ? "default" : "outline"} className="rounded-full" onClick={() => setFilter("all")}>
              الكل <span className="ms-1 opacity-70">({files.length})</span>
            </Button>
            {(Object.keys(categories) as PatientFileCategory[])
              .filter((c) => counts.get(c))
              .map((c) => (
                <Button key={c} size="sm" variant={filter === c ? "default" : "outline"} className="rounded-full" onClick={() => setFilter(c)}>
                  {categories[c]} <span className="ms-1 opacity-70">({counts.get(c)})</span>
                </Button>
              ))}
          </div>
        )}

        {/* Grid */}
        {isLoading ? (
          <p className="py-6 text-center text-muted-foreground">جاري التحميل...</p>
        ) : error ? (
          <p className="py-6 text-center text-destructive">{apiErrorMessage(error)}</p>
        ) : files.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <FolderOpen className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
            <p>لا توجد ملفات لهذا المريض بعد</p>
            <p className="mt-1 text-xs">صور الأشعة والتحاليل والتقارير تظهر هنا مرتبة حسب التاريخ</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((m) => (
              <section key={m.month} className="space-y-3">
                <h3 className="border-b pb-1 text-sm font-semibold">{safeFormat(`${m.month}-01`, "MMMM yyyy")}</h3>
                {m.days.map((d) => (
                  <div key={d.day} className="space-y-2">
                    <p className="text-xs text-muted-foreground">{safeFormat(d.day, "EEEE d MMMM")}</p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                      {d.items.map((f) => (
                        <div
                          key={f.id}
                          className={`group relative overflow-hidden rounded-md border bg-card ${selected.includes(f.id) ? "ring-2 ring-primary" : ""}`}
                        >
                          <button
                            type="button"
                            className="block w-full text-start"
                            onClick={() => {
                              setViewerId(f.id);
                              setEditMode(false);
                            }}
                          >
                            <div className="flex aspect-square items-center justify-center bg-muted/50">
                              {f.is_image ? (
                                <img src={imageSrc(f)} alt={f.title} loading="lazy" className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                                  <FileText className="h-10 w-10" />
                                  <span className="text-xs font-semibold">PDF</span>
                                </div>
                              )}
                            </div>
                            <div className="p-2">
                              <p className="truncate text-sm font-medium" title={f.title}>{f.title}</p>
                              <p className="truncate text-xs text-muted-foreground">{catLabel(f.category)}</p>
                            </div>
                          </button>
                          {f.is_image && (
                            <label
                              className="absolute end-1.5 top-1.5 flex items-center rounded bg-background/90 p-1 shadow-sm"
                              title="تحديد للمقارنة"
                            >
                              <Checkbox checked={selected.includes(f.id)} onCheckedChange={() => toggleSelect(f.id)} />
                            </label>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            ))}
            {selected.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {selected.length === 1 ? "اختر صورة ثانية للمقارنة (قبل/بعد)" : "تم تحديد صورتين — اضغط «مقارنة»"}
                <Button variant="link" size="sm" className="h-auto px-2 text-xs" onClick={() => setSelected([])}>
                  إلغاء التحديد
                </Button>
              </p>
            )}
          </div>
        )}
      </CardContent>

      {/* Viewer */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewerId(null)}>
        <DialogContent dir="rtl" className="max-h-[95vh] max-w-6xl overflow-y-auto">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 pe-6">
                  <span className="truncate">{viewing.title}</span>
                  <Badge variant="secondary">{catLabel(viewing.category)}</Badge>
                  <span className="ms-auto text-xs font-normal text-muted-foreground tabular-nums">
                    {viewerIndex + 1} / {visible.length}
                  </span>
                </DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
                <div className="relative min-w-0">
                  {isPdf(viewing) ? (
                    <iframe src={patientFilesApi.contentUrl(viewing.id)} title={viewing.title} className="h-[70vh] w-full rounded-md border" />
                  ) : (
                    <ZoomableImage src={patientFilesApi.contentUrl(viewing.id)} alt={viewing.title} heightClass="h-[60vh] lg:h-[70vh]" allowRotate />
                  )}
                  {visible.length > 1 && (
                    <div className="mt-2 flex justify-between">
                      <Button size="sm" variant="outline" onClick={() => go(-1)}>
                        <ChevronRight className="h-4 w-4 ms-1" />
                        السابق
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => go(1)}>
                        التالي
                        <ChevronLeft className="h-4 w-4 me-1" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-3 text-sm">
                  {editMode ? (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label>العنوان</Label>
                        <Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} maxLength={255} />
                      </div>
                      <div className="space-y-1">
                        <Label>التصنيف</Label>
                        <Select value={edit.category} onValueChange={(v) => setEdit({ ...edit, category: v as PatientFileCategory })} dir="rtl">
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(categories) as PatientFileCategory[]).map((c) => (
                              <SelectItem key={c} value={c}>{categories[c]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label>التاريخ</Label>
                        <Input type="date" value={edit.taken_at} onChange={(e) => setEdit({ ...edit, taken_at: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label>ملاحظات</Label>
                        <Textarea value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} rows={3} maxLength={2000} />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={update.isPending || !edit.title.trim()}
                          onClick={() =>
                            update.mutate({
                              id: viewing.id,
                              body: {
                                title: edit.title.trim(),
                                category: edit.category,
                                taken_at: edit.taken_at || null,
                                notes: edit.notes.trim() || null,
                              },
                            })
                          }
                        >
                          {update.isPending ? "جاري الحفظ..." : "حفظ"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditMode(false)}>
                          إلغاء
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <dl className="space-y-2">
                      <InfoRow label="العنوان" value={viewing.title} />
                      <InfoRow label="التصنيف" value={catLabel(viewing.category)} />
                      <InfoRow label="التاريخ" value={viewing.taken_at ? safeFormat(viewing.taken_at, "d MMMM yyyy") : "—"} />
                      <InfoRow label="رفع بواسطة" value={viewing.uploader ? viewing.uploader.full_name || viewing.uploader.email : "—"} />
                      {viewing.doctor && <InfoRow label="الطبيب" value={viewing.doctor.full_name} />}
                      {viewing.specialty && <InfoRow label="الاختصاص" value={viewing.specialty.name_ar} />}
                      {viewing.notes && <InfoRow label="ملاحظات" value={viewing.notes} />}
                      <InfoRow label="الحجم" value={<span dir="ltr">{formatSize(viewing.size)}</span>} />
                      <InfoRow label="اسم الملف" value={<span className="break-all" dir="ltr">{viewing.original_name}</span>} />
                    </dl>
                  )}

                  {!editMode && (
                    <div className="flex flex-wrap gap-2 border-t pt-3">
                      <Button size="sm" variant="outline" asChild>
                        <a href={patientFilesApi.contentUrl(viewing.id)} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 ms-1" />
                          فتح في نافذة جديدة
                        </a>
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <a href={patientFilesApi.contentUrl(viewing.id, true)}>
                          <Download className="h-4 w-4 ms-1" />
                          تنزيل
                        </a>
                      </Button>
                      {canUpdate && (
                        <Button size="sm" variant="outline" onClick={() => openEdit(viewing)}>
                          <Edit className="h-4 w-4 ms-1" />
                          تعديل
                        </Button>
                      )}
                      {canDelete && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="outline" className="text-destructive">
                              <Trash2 className="h-4 w-4 ms-1" />
                              حذف
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent dir="rtl">
                            <AlertDialogHeader>
                              <AlertDialogTitle>حذف الملف «{viewing.title}»؟</AlertDialogTitle>
                              <AlertDialogDescription>سيُحذف الملف من سجل المريض.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>إلغاء</AlertDialogCancel>
                              <AlertDialogAction onClick={() => remove.mutate(viewing.id)} disabled={remove.isPending}>
                                حذف
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Compare */}
      <Dialog open={compareOpen && compareFiles.length === 2} onOpenChange={setCompareOpen}>
        <DialogContent dir="rtl" className="max-h-[95vh] w-[98vw] max-w-[98vw] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>مقارنة الصور</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            {[...compareFiles]
              .sort((a, b) => fileDay(a).localeCompare(fileDay(b)))
              .map((f, i) => (
                <div key={f.id} className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant={i === 0 ? "outline" : "default"}>{i === 0 ? "قبل" : "بعد"}</Badge>
                    <span className="truncate font-medium">{f.title}</span>
                    <span className="text-muted-foreground">{safeFormat(fileDay(f), "d MMMM yyyy")}</span>
                  </div>
                  <ZoomableImage src={patientFilesApi.contentUrl(f.id)} alt={f.title} heightClass="h-[45vh] md:h-[70vh]" allowRotate />
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap break-words">{value}</dd>
    </div>
  );
}
