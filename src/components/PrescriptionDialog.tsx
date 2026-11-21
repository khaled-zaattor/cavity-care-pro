import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2, Printer, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import {
  apiErrorMessage,
  doctorsApi,
  medicinesApi,
  prescriptionsApi,
  prescriptionTemplatesApi,
  type Medicine,
  type Prescription,
  type PrescriptionItemInput,
} from "@/api/clinic";

type Row = PrescriptionItemInput & { key: number };

let rowKey = 0;
const emptyRow = (): Row => ({ key: ++rowKey, medicine_id: null, medicine_name: "", dose: "", frequency: "", duration: "", instructions: "" });
const toRows = (items: PrescriptionItemInput[]): Row[] => (items.length ? items.map((i) => ({ ...i, key: ++rowKey })) : [emptyRow()]);

const medicineLabel = (m: Medicine) => [m.trade_name, m.strength].filter(Boolean).join(" ");

/** Medicine name input with instant suggestions from the (preloaded) catalog. */
function MedicineInput({ value, medicines, onPick, onType }: {
  value: string;
  medicines: Medicine[];
  onPick: (m: Medicine) => void;
  onType: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return medicines.slice(0, 8);
    return medicines
      .filter((m) => m.trade_name.toLowerCase().includes(q) || (m.generic_name ?? "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [value, medicines]);

  return (
    <div className="relative">
      <Input
        value={value}
        placeholder="اسم الدواء"
        onChange={(e) => {
          onType(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && matches.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-56 overflow-auto">
          {matches.map((m) => (
            <button
              type="button"
              key={m.id}
              className="block w-full px-3 py-2 text-start text-sm hover:bg-accent"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(m);
                setOpen(false);
              }}
            >
              <span className="font-medium" dir="ltr">{medicineLabel(m)}</span>
              {(m.generic_name || m.form) && (
                <span className="text-xs text-muted-foreground ms-2">{[m.generic_name, m.form].filter(Boolean).join(" · ")}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient: { id: string; full_name: string };
  appointmentId?: string | null;
  /** Edit an existing prescription instead of writing a new one. */
  prescription?: Prescription | null;
}

/**
 * Write / edit a prescription (plan §2.3). After saving, the A4 print page
 * opens in a new tab.
 */
export function PrescriptionDialog({ open, onOpenChange, patient, appointmentId, prescription }: Props) {
  const queryClient = useQueryClient();
  const { isSuperAdmin, doctorId: ownDoctorId } = useUserRole();
  const editing = !!prescription;

  const [doctorId, setDoctorId] = useState<string>("");
  const [diagnosis, setDiagnosis] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [templateName, setTemplateName] = useState("");
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDoctorId(prescription?.doctor_id ?? ownDoctorId ?? "");
    setDiagnosis(prescription?.diagnosis ?? "");
    setNotes(prescription?.notes ?? "");
    setRows(toRows(prescription?.items ?? []));
    setShowSaveTemplate(false);
    setTemplateName("");
  }, [open, prescription, ownDoctorId]);

  const { data: medicines = [] } = useQuery({ queryKey: ["medicines"], queryFn: () => medicinesApi.list(), enabled: open });
  const { data: doctors = [] } = useQuery({ queryKey: ["doctors"], queryFn: () => doctorsApi.list(), enabled: open && isSuperAdmin });
  const templateDoctor = isSuperAdmin ? doctorId || undefined : undefined;
  const { data: templates = [] } = useQuery({
    queryKey: ["prescription-templates", templateDoctor ?? "own"],
    queryFn: () => prescriptionTemplatesApi.list(templateDoctor),
    enabled: open && (!isSuperAdmin || !!doctorId),
  });

  const setRow = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const items = (): PrescriptionItemInput[] =>
    rows
      .filter((r) => (r.medicine_name ?? "").trim() || r.medicine_id)
      .map(({ key: _key, ...r }) => ({ ...r, medicine_name: (r.medicine_name ?? "").trim() || null }));

  const save = useMutation({
    mutationFn: () => {
      const body = { diagnosis: diagnosis || null, notes: notes || null, items: items() };
      return editing
        ? prescriptionsApi.update(prescription!.id, body)
        : prescriptionsApi.create({ ...body, patient_id: patient.id, appointment_id: appointmentId ?? null, doctor_id: isSuperAdmin ? doctorId || null : null });
    },
    onSuccess: (p) => {
      queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
      toast({ title: editing ? "تم تعديل الوصفة" : `تم حفظ الوصفة رقم ${p.number}` });
      onOpenChange(false);
    },
    onError: (e) => toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" }),
  });

  const saveTemplate = useMutation({
    mutationFn: () =>
      prescriptionTemplatesApi.create({
        name: templateName.trim(),
        doctor_id: isSuperAdmin ? doctorId || null : null,
        diagnosis: diagnosis || null,
        notes: notes || null,
        items: items().map((i) => ({ ...i, medicine_name: i.medicine_name ?? "" })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prescription-templates"] });
      toast({ title: "تم حفظ القالب" });
      setShowSaveTemplate(false);
      setTemplateName("");
    },
    onError: (e) => toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" }),
  });

  const applyTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setDiagnosis(t.diagnosis ?? "");
    setNotes(t.notes ?? "");
    setRows(toRows(t.items));
  };

  const canSave = items().length > 0 && (!isSuperAdmin || !!doctorId || editing);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {editing ? `تعديل الوصفة رقم ${prescription!.number}` : "وصفة طبية جديدة"} — {patient.full_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {isSuperAdmin && !editing && (
              <div>
                <Label>الطبيب</Label>
                <Select value={doctorId || undefined} onValueChange={setDoctorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الطبيب" />
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
            {templates.length > 0 && (
              <div>
                <Label>قالب جاهز</Label>
                <Select onValueChange={applyTemplate}>
                  <SelectTrigger>
                    <SelectValue placeholder="استخدام قالب..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="rx_diagnosis">التشخيص</Label>
            <Input id="rx_diagnosis" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="اختياري" />
          </div>

          <div className="space-y-2">
            <Label>الأدوية</Label>
            {rows.map((r, i) => (
              <div key={r.key} className="rounded-md border p-3 space-y-2 bg-muted/20">
                <div className="flex items-start gap-2">
                  <span className="mt-2 text-sm font-semibold text-muted-foreground w-5">{i + 1}.</span>
                  <div className="flex-1">
                    <MedicineInput
                      value={r.medicine_name ?? ""}
                      medicines={medicines}
                      onType={(text) => setRow(r.key, { medicine_name: text, medicine_id: null })}
                      onPick={(m) =>
                        setRow(r.key, {
                          medicine_id: m.id,
                          medicine_name: medicineLabel(m),
                          dose: r.dose || m.default_dose || "",
                          frequency: r.frequency || m.default_frequency || "",
                          duration: r.duration || m.default_duration || "",
                        })
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={rows.length === 1}
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                    title="حذف الدواء"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 ps-7">
                  <Input value={r.dose ?? ""} onChange={(e) => setRow(r.key, { dose: e.target.value })} placeholder="الجرعة (مثال: قرص واحد)" />
                  <Input value={r.frequency ?? ""} onChange={(e) => setRow(r.key, { frequency: e.target.value })} placeholder="التكرار (مثال: 3 مرات يومياً)" />
                  <Input value={r.duration ?? ""} onChange={(e) => setRow(r.key, { duration: e.target.value })} placeholder="المدة (مثال: 5 أيام)" />
                </div>
                <div className="ps-7">
                  <Input value={r.instructions ?? ""} onChange={(e) => setRow(r.key, { instructions: e.target.value })} placeholder="تعليمات (مثال: بعد الطعام)" />
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, emptyRow()])}>
              <Plus className="h-4 w-4 ms-1" />
              إضافة دواء
            </Button>
          </div>

          <div>
            <Label htmlFor="rx_notes">ملاحظات للمريض</Label>
            <Textarea id="rx_notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="اختياري" />
          </div>

          {showSaveTemplate && (
            <div className="flex gap-2 items-end rounded-md border p-3">
              <div className="flex-1">
                <Label htmlFor="rx_tpl">اسم القالب</Label>
                <Input id="rx_tpl" value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="مثال: التهاب لثة" />
              </div>
              <Button type="button" disabled={!templateName.trim() || items().length === 0 || saveTemplate.isPending} onClick={() => saveTemplate.mutate()}>
                حفظ القالب
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowSaveTemplate((v) => !v)}>
            <Save className="h-4 w-4 ms-1" />
            حفظ كقالب
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button
              type="button"
              disabled={!canSave || save.isPending}
              onClick={() => {
                // Open the tab during the click (pop-up blockers allow that), then point it at the print page.
                const tab = window.open("", "_blank");
                save.mutate(undefined, {
                  onSuccess: (p) => {
                    if (tab) tab.location.href = `/print/prescription/${p.id}`;
                  },
                  onError: () => tab?.close(),
                });
              }}
            >
              <Printer className="h-4 w-4 ms-1" />
              {save.isPending ? "جاري الحفظ..." : "حفظ وطباعة"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
