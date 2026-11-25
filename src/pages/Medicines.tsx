import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, FileText, Pill, Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import {
  apiErrorMessage,
  doctorsApi,
  Medicine,
  medicinesApi,
  PrescriptionItemInput,
  PrescriptionTemplate,
  prescriptionTemplatesApi,
  Specialty,
  specialtiesApi,
} from "@/api/clinic";

const FORMS = ["أقراص", "كبسولات", "شراب", "نقط", "حقن", "مرهم/كريم", "غسول فموي", "تحاميل", "بخاخ", "أخرى"];
const NONE = "__none__";

const showError = (e: unknown) => toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" });
const orNull = (v: string) => (v.trim() ? v.trim() : null);

// ---------------------------------------------------------------------------
// Medicines list
// ---------------------------------------------------------------------------

interface MedicineForm {
  id?: string;
  trade_name: string;
  generic_name: string;
  form: string;
  strength: string;
  default_dose: string;
  default_frequency: string;
  default_duration: string;
  notes: string;
  specialty_id: string | null;
  is_active: boolean;
}

const emptyMedicine: MedicineForm = {
  trade_name: "",
  generic_name: "",
  form: "",
  strength: "",
  default_dose: "",
  default_frequency: "",
  default_duration: "",
  notes: "",
  specialty_id: null,
  is_active: true,
};

const toMedicineForm = (m: Medicine): MedicineForm => ({
  id: m.id,
  trade_name: m.trade_name,
  generic_name: m.generic_name ?? "",
  form: m.form ?? "",
  strength: m.strength ?? "",
  default_dose: m.default_dose ?? "",
  default_frequency: m.default_frequency ?? "",
  default_duration: m.default_duration ?? "",
  notes: m.notes ?? "",
  specialty_id: m.specialty_id,
  is_active: m.is_active,
});

function MedicinesTab({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<MedicineForm | null>(null);
  const [toDelete, setToDelete] = useState<Medicine | null>(null);

  const { data: medicines = [], isLoading } = useQuery({
    queryKey: ["medicines", "manage", canWrite],
    queryFn: () => medicinesApi.list({ include_inactive: canWrite, limit: 2000 }),
  });

  const { data: specialties = [] } = useQuery({
    queryKey: ["specialties", "all"],
    queryFn: () => specialtiesApi.list(true),
  });

  const specialtyName = useMemo(() => {
    const map = new Map<string, Specialty>(specialties.map((s) => [s.id, s]));
    return (id: string | null) => (id ? map.get(id)?.name_ar ?? "-" : "عام");
  }, [specialties]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return medicines;
    return medicines.filter((m) =>
      [m.trade_name, m.generic_name, m.form, m.strength].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [medicines, search]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["medicines"] });

  const save = useMutation({
    mutationFn: (f: MedicineForm) => {
      const body = {
        trade_name: f.trade_name.trim(),
        generic_name: orNull(f.generic_name),
        form: orNull(f.form),
        strength: orNull(f.strength),
        default_dose: orNull(f.default_dose),
        default_frequency: orNull(f.default_frequency),
        default_duration: orNull(f.default_duration),
        notes: orNull(f.notes),
        specialty_id: f.specialty_id,
        is_active: f.is_active,
      };
      return f.id ? medicinesApi.update(f.id, body) : medicinesApi.create(body);
    },
    onSuccess: () => {
      refresh();
      setForm(null);
      toast({ title: "تم الحفظ", description: "تم حفظ الدواء" });
    },
    onError: showError,
  });

  const remove = useMutation({
    mutationFn: (id: string) => medicinesApi.remove(id),
    onSuccess: () => {
      refresh();
      setToDelete(null);
      toast({ title: "تم الحذف", description: "تم حذف الدواء" });
    },
    onError: showError,
  });

  const defaults = (m: Medicine) => [m.default_dose, m.default_frequency, m.default_duration].filter(Boolean).join(" — ") || "-";

  const actions = (m: Medicine) => (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={() => setForm(toMedicineForm(m))}>
        <Edit className="h-4 w-4 ml-1" />
        تعديل
      </Button>
      <Button variant="outline" size="sm" onClick={() => setToDelete(m)}>
        <Trash2 className="h-4 w-4 ml-1" />
        حذف
      </Button>
    </div>
  );

  const text = (key: keyof MedicineForm, label: string, opts: { dir?: "ltr"; required?: boolean; placeholder?: string } = {}) =>
    form && (
      <div>
        <Label htmlFor={`med_${key}`}>{label}</Label>
        <Input
          id={`med_${key}`}
          dir={opts.dir}
          required={opts.required}
          placeholder={opts.placeholder}
          value={(form[key] as string) ?? ""}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        />
      </div>
    );

  const activeSpecialties = specialties.filter((s) => s.is_active || s.id === form?.specialty_id);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <CardTitle>قائمة الأدوية</CardTitle>
            <CardDescription>الأدوية التي تظهر كاقتراحات عند كتابة الوصفة مع الجرعة الافتراضية</CardDescription>
          </div>
          {canWrite && (
            <Button onClick={() => setForm({ ...emptyMedicine })}>
              <Plus className="ml-2 h-4 w-4" />
              إضافة دواء
            </Button>
          )}
        </div>
        <div className="relative mt-2">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pr-9"
            placeholder="ابحث بالاسم التجاري أو العلمي..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="text-center py-8">جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">{search ? "لا توجد نتائج" : "لا توجد أدوية بعد"}</div>
        ) : (
          <>
            {/* desktop */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الاسم التجاري</TableHead>
                    <TableHead>الاسم العلمي</TableHead>
                    <TableHead>الشكل</TableHead>
                    <TableHead>التركيز</TableHead>
                    <TableHead>الجرعة — التكرار — المدة</TableHead>
                    <TableHead>التخصص</TableHead>
                    <TableHead>الحالة</TableHead>
                    {canWrite && <TableHead>الإجراءات</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.trade_name}</TableCell>
                      <TableCell dir="auto">{m.generic_name ?? "-"}</TableCell>
                      <TableCell>{m.form ?? "-"}</TableCell>
                      <TableCell dir="auto">{m.strength ?? "-"}</TableCell>
                      <TableCell className="text-sm">{defaults(m)}</TableCell>
                      <TableCell>{specialtyName(m.specialty_id)}</TableCell>
                      <TableCell>
                        <Badge variant={m.is_active ? "default" : "outline"}>{m.is_active ? "فعال" : "موقوف"}</Badge>
                      </TableCell>
                      {canWrite && <TableCell>{actions(m)}</TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* mobile */}
            <div className="space-y-3 md:hidden">
              {filtered.map((m) => (
                <div key={m.id} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">
                        {m.trade_name} {m.strength && <span className="text-muted-foreground text-sm">{m.strength}</span>}
                      </div>
                      {m.generic_name && <div className="text-xs text-muted-foreground">{m.generic_name}</div>}
                    </div>
                    <Badge variant={m.is_active ? "default" : "outline"}>{m.is_active ? "فعال" : "موقوف"}</Badge>
                  </div>
                  <div className="text-sm">
                    {m.form ?? "-"} · {specialtyName(m.specialty_id)}
                  </div>
                  <div className="text-sm text-muted-foreground">{defaults(m)}</div>
                  {canWrite && actions(m)}
                </div>
              ))}
            </div>
          </>
        )}
        <p className="text-xs text-muted-foreground">الأدوية المكتوبة يدوياً في الوصفة تحفظ في الوصفة فقط ولا تضاف للقائمة</p>
      </CardContent>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{form?.id ? "تعديل دواء" : "إضافة دواء"}</DialogTitle>
          </DialogHeader>
          {form && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate(form);
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                {text("trade_name", "الاسم التجاري", { required: true })}
                {text("generic_name", "الاسم العلمي (اختياري)", { dir: "ltr" })}
                <div>
                  <Label>الشكل الدوائي</Label>
                  <Select value={form.form || NONE} onValueChange={(v) => setForm({ ...form, form: v === NONE ? "" : v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>غير محدد</SelectItem>
                      {FORMS.map((f) => (
                        <SelectItem key={f} value={f}>
                          {f}
                        </SelectItem>
                      ))}
                      {form.form && !FORMS.includes(form.form) && <SelectItem value={form.form}>{form.form}</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
                {text("strength", "التركيز", { placeholder: "500mg" })}
                {text("default_dose", "الجرعة الافتراضية", { placeholder: "حبة واحدة" })}
                {text("default_frequency", "التكرار الافتراضي", { placeholder: "3 مرات يومياً" })}
                {text("default_duration", "المدة الافتراضية", { placeholder: "5 أيام" })}
                <div>
                  <Label>التخصص</Label>
                  <Select
                    value={form.specialty_id ?? NONE}
                    onValueChange={(v) => setForm({ ...form, specialty_id: v === NONE ? null : v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>عام</SelectItem>
                      {activeSpecialties.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name_ar}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="med_notes">ملاحظات (اختياري)</Label>
                <Textarea id="med_notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label htmlFor="med_active">فعال</Label>
                  <p className="text-xs text-muted-foreground">الدواء الموقوف لا يظهر في اقتراحات الوصفة</p>
                </div>
                <Switch id="med_active" checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              </div>
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setForm(null)}>
                  إلغاء
                </Button>
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending ? "جاري الحفظ..." : "حفظ"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الدواء</AlertDialogTitle>
            <AlertDialogDescription>
              هل تريد حذف "{toDelete?.trade_name}" من القائمة؟ الوصفات السابقة تحتفظ باسم الدواء. يمكنك إيقافه بدلاً من حذفه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (toDelete) remove.mutate(toDelete.id);
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Prescription templates
// ---------------------------------------------------------------------------

interface ItemRow extends PrescriptionItemInput {
  key: number;
  medicine_name: string;
}

interface TemplateForm {
  id?: string;
  name: string;
  diagnosis: string;
  notes: string;
  items: ItemRow[];
}

let rowKey = 0;
const newRow = (item: Partial<ItemRow> = {}): ItemRow => ({
  medicine_id: null,
  medicine_name: "",
  dose: "",
  frequency: "",
  duration: "",
  ...item,
  key: ++rowKey,
});

const medicineLabel = (m: Medicine) => [m.trade_name, m.strength].filter(Boolean).join(" ");

/** Name input with suggestions from the medicines list; free text is allowed. */
function MedicinePicker({ value, onType, onPick }: { value: string; onType: (v: string) => void; onPick: (m: Medicine) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setQ(value.trim()), 250);
    return () => clearTimeout(t);
  }, [value]);

  const { data: suggestions = [] } = useQuery({
    queryKey: ["medicines", "search", q],
    queryFn: () => medicinesApi.list({ q }),
    enabled: open && q.length > 0,
    staleTime: 60_000,
  });

  return (
    <div className="relative">
      <Input
        placeholder="اسم الدواء"
        value={value}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          onType(e.target.value);
          setOpen(true);
        }}
      />
      {open && q.length > 0 && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {suggestions.slice(0, 20).map((m) => (
            <button
              key={m.id}
              type="button"
              className="block w-full px-3 py-2 text-right text-sm hover:bg-accent"
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(m);
                setOpen(false);
              }}
            >
              <span className="font-medium">{medicineLabel(m)}</span>
              {m.form && <span className="text-muted-foreground"> · {m.form}</span>}
              {m.generic_name && <span className="block text-xs text-muted-foreground">{m.generic_name}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplatesTab({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [pickedDoctor, setPickedDoctor] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateForm | null>(null);
  const [toDelete, setToDelete] = useState<PrescriptionTemplate | null>(null);

  const { data: doctors = [] } = useQuery({
    queryKey: ["doctors"],
    queryFn: () => doctorsApi.list(),
    enabled: isSuperAdmin,
  });

  const doctorId = isSuperAdmin ? pickedDoctor ?? doctors[0]?.id ?? null : undefined;

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["prescription-templates", doctorId ?? "own"],
    queryFn: () => prescriptionTemplatesApi.list(doctorId ?? undefined),
    enabled: !isSuperAdmin || !!doctorId,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["prescription-templates"] });

  const save = useMutation({
    mutationFn: (f: TemplateForm) => {
      const items: PrescriptionItemInput[] = f.items
        .filter((i) => i.medicine_name.trim())
        .map((i) => ({
          medicine_id: i.medicine_id ?? null,
          medicine_name: i.medicine_name.trim(),
          dose: orNull(i.dose ?? ""),
          frequency: orNull(i.frequency ?? ""),
          duration: orNull(i.duration ?? ""),
        }));
      const body = { name: f.name.trim(), diagnosis: orNull(f.diagnosis), notes: orNull(f.notes), items };
      return f.id
        ? prescriptionTemplatesApi.update(f.id, body)
        : prescriptionTemplatesApi.create({ ...body, doctor_id: isSuperAdmin ? doctorId : undefined });
    },
    onSuccess: () => {
      refresh();
      setForm(null);
      toast({ title: "تم الحفظ", description: "تم حفظ القالب" });
    },
    onError: showError,
  });

  const remove = useMutation({
    mutationFn: (id: string) => prescriptionTemplatesApi.remove(id),
    onSuccess: () => {
      refresh();
      setToDelete(null);
      toast({ title: "تم الحذف", description: "تم حذف القالب" });
    },
    onError: showError,
  });

  const openEdit = (t: PrescriptionTemplate) =>
    setForm({
      id: t.id,
      name: t.name,
      diagnosis: t.diagnosis ?? "",
      notes: t.notes ?? "",
      items: t.items.length
        ? t.items.map((i) =>
            newRow({
              medicine_id: i.medicine_id ?? null,
              medicine_name: i.medicine_name,
              dose: i.dose ?? "",
              frequency: i.frequency ?? "",
              duration: i.duration ?? "",
            }),
          )
        : [newRow()],
    });

  const updateRow = (key: number, patch: Partial<ItemRow>) =>
    form && setForm({ ...form, items: form.items.map((r) => (r.key === key ? { ...r, ...patch } : r)) });

  const submit = (f: TemplateForm) => {
    if (!f.items.some((i) => i.medicine_name.trim())) {
      toast({ title: "خطأ", description: "أضف دواءً واحداً على الأقل", variant: "destructive" });
      return;
    }
    save.mutate(f);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <CardTitle>قوالب الوصفات</CardTitle>
            <CardDescription>القوالب تظهر عند كتابة وصفة جديدة لملء الأدوية بضغطة واحدة</CardDescription>
          </div>
          <Button disabled={isSuperAdmin && !doctorId} onClick={() => setForm({ name: "", diagnosis: "", notes: "", items: [newRow()] })}>
            <Plus className="ml-2 h-4 w-4" />
            قالب جديد
          </Button>
        </div>
        {isSuperAdmin && (
          <div className="mt-2 max-w-xs">
            <Label>الطبيب</Label>
            <Select value={doctorId ?? undefined} onValueChange={setPickedDoctor}>
              <SelectTrigger>
                <SelectValue placeholder="اختر طبيباً" />
              </SelectTrigger>
              <SelectContent>
                {doctors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isSuperAdmin && !doctorId ? (
          <div className="text-center py-8 text-muted-foreground">لا يوجد أطباء</div>
        ) : isLoading ? (
          <div className="text-center py-8">جاري التحميل...</div>
        ) : templates.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">لا توجد قوالب بعد</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {templates.map((t) => (
              <div key={t.id} className="rounded-md border p-4 space-y-3 flex flex-col">
                <div>
                  <div className="font-semibold">{t.name}</div>
                  {t.diagnosis && <div className="text-sm text-muted-foreground">التشخيص: {t.diagnosis}</div>}
                </div>
                <ul className="space-y-1 text-sm flex-1">
                  {t.items.map((i) => (
                    <li key={i.id} className="flex gap-2">
                      <Pill className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                      <span>{[i.medicine_name, i.dose, i.frequency, i.duration].filter(Boolean).join(" — ")}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(t)}>
                    <Edit className="h-4 w-4 ml-1" />
                    تعديل
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setToDelete(t)}>
                    <Trash2 className="h-4 w-4 ml-1" />
                    حذف
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{form?.id ? "تعديل قالب" : "قالب جديد"}</DialogTitle>
          </DialogHeader>
          {form && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                submit(form);
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="tpl_name">اسم القالب</Label>
                  <Input
                    id="tpl_name"
                    required
                    placeholder="مثال: التهاب لثة"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="tpl_diagnosis">التشخيص (اختياري)</Label>
                  <Input id="tpl_diagnosis" value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} />
                </div>
              </div>
              <div>
                <Label htmlFor="tpl_notes">ملاحظات (اختياري)</Label>
                <Textarea id="tpl_notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>

              <div className="space-y-2">
                <Label>الأدوية</Label>
                {form.items.map((row) => (
                  <div key={row.key} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:border-0 sm:p-0">
                    <MedicinePicker
                      value={row.medicine_name}
                      onType={(v) => updateRow(row.key, { medicine_name: v, medicine_id: null })}
                      onPick={(m) =>
                        updateRow(row.key, {
                          medicine_id: m.id,
                          medicine_name: medicineLabel(m),
                          dose: m.default_dose ?? row.dose,
                          frequency: m.default_frequency ?? row.frequency,
                          duration: m.default_duration ?? row.duration,
                        })
                      }
                    />
                    <Input placeholder="الجرعة" value={row.dose ?? ""} onChange={(e) => updateRow(row.key, { dose: e.target.value })} />
                    <Input
                      placeholder="التكرار"
                      value={row.frequency ?? ""}
                      onChange={(e) => updateRow(row.key, { frequency: e.target.value })}
                    />
                    <Input placeholder="المدة" value={row.duration ?? ""} onChange={(e) => updateRow(row.key, { duration: e.target.value })} />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="حذف السطر"
                      disabled={form.items.length === 1}
                      onClick={() => setForm({ ...form, items: form.items.filter((r) => r.key !== row.key) })}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={form.items.length >= 30}
                  onClick={() => setForm({ ...form, items: [...form.items, newRow()] })}
                >
                  <Plus className="h-4 w-4 ml-1" />
                  إضافة دواء
                </Button>
                <p className="text-xs text-muted-foreground">
                  اختر من الاقتراحات لملء الجرعة الافتراضية، أو اكتب اسم الدواء يدوياً
                </p>
              </div>

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setForm(null)}>
                  إلغاء
                </Button>
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending ? "جاري الحفظ..." : "حفظ"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف القالب</AlertDialogTitle>
            <AlertDialogDescription>هل تريد حذف القالب "{toDelete?.name}"؟ الوصفات السابقة لا تتأثر.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (toDelete) remove.mutate(toDelete.id);
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/** الأدوية: the medicines catalog and the doctor's prescription templates. */
export default function Medicines() {
  const { userRole, isSuperAdmin } = useUserRole();
  const canWrite = userRole === "super_admin" || userRole === "doctor";

  return (
    <div className="space-y-4 lg:space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <Pill className="h-5 w-5 text-primary" />
        </div>
        <h1 className="text-2xl lg:text-3xl font-bold">الأدوية</h1>
      </div>

      <Tabs defaultValue="medicines" dir="rtl" className="space-y-4">
        <TabsList>
          <TabsTrigger value="medicines" className="flex items-center gap-2">
            <Pill className="h-4 w-4" />
            قائمة الأدوية
          </TabsTrigger>
          {canWrite && (
            <TabsTrigger value="templates" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              قوالب الوصفات
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="medicines">
          <MedicinesTab canWrite={canWrite} />
        </TabsContent>
        {canWrite && (
          <TabsContent value="templates">
            <TemplatesTab isSuperAdmin={isSuperAdmin} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
