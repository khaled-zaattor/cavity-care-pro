import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { apiErrorMessage, medicalApi, type GynecologyProfile } from "@/api/clinic";
import { fmtDate } from "@/pages/patient-profile/utils";

type CountKey = "pregnancies" | "living_children" | "abortions" | "preterm_births";
type HistoryKey = "medical_history" | "surgical_history" | "family_history" | "allergy_history" | "medication_history";

const COUNTS: { key: CountKey; label: string }[] = [
  { key: "pregnancies", label: "عدد الحمول" },
  { key: "living_children", label: "عدد الأولاد الأحياء" },
  { key: "abortions", label: "عدد الإجهاضات" },
  { key: "preterm_births", label: "عدد الولادات الباكرة" },
];

const HISTORIES: { key: HistoryKey; label: string }[] = [
  { key: "medical_history", label: "السوابق المرضية" },
  { key: "surgical_history", label: "السوابق الجراحية" },
  { key: "family_history", label: "السوابق العائلية" },
  { key: "allergy_history", label: "السوابق التحسسية" },
  { key: "medication_history", label: "السوابق الدوائية" },
];

/** Form state: every value is a string ("" = not filled). */
type Form = Record<CountKey | HistoryKey | "weight_kg" | "blood_pressure" | "is_smoker" | "marital_status", string>;

const toForm = (p: GynecologyProfile | null | undefined): Form => ({
  is_smoker: p?.is_smoker == null ? "" : p.is_smoker ? "yes" : "no",
  marital_status: p?.marital_status ?? "",
  pregnancies: p?.pregnancies?.toString() ?? "",
  living_children: p?.living_children?.toString() ?? "",
  abortions: p?.abortions?.toString() ?? "",
  preterm_births: p?.preterm_births?.toString() ?? "",
  medical_history: p?.medical_history ?? "",
  surgical_history: p?.surgical_history ?? "",
  family_history: p?.family_history ?? "",
  allergy_history: p?.allergy_history ?? "",
  medication_history: p?.medication_history ?? "",
  weight_kg: p?.weight_kg?.toString() ?? "",
  blood_pressure: p?.blood_pressure ?? "",
});

const intOrNull = (v: string) => (v.trim() === "" ? null : Math.max(0, parseInt(v, 10) || 0));
const textOrNull = (v: string) => (v.trim() === "" ? null : v.trim());

const fromForm = (f: Form): Partial<GynecologyProfile> => ({
  is_smoker: f.is_smoker === "" ? null : f.is_smoker === "yes",
  marital_status: f.marital_status === "" ? null : (f.marital_status as "single" | "married"),
  pregnancies: intOrNull(f.pregnancies),
  living_children: intOrNull(f.living_children),
  abortions: intOrNull(f.abortions),
  preterm_births: intOrNull(f.preterm_births),
  medical_history: textOrNull(f.medical_history),
  surgical_history: textOrNull(f.surgical_history),
  family_history: textOrNull(f.family_history),
  allergy_history: textOrNull(f.allergy_history),
  medication_history: textOrNull(f.medication_history),
  weight_kg: f.weight_kg.trim() === "" ? null : Number(f.weight_kg.replace(",", ".")),
  blood_pressure: textOrNull(f.blood_pressure),
});

function Value({ label, value, wide }: { label: string; value: string | null | undefined; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2 lg:col-span-3" : undefined}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-sm whitespace-pre-wrap ${value ? "font-medium" : "text-muted-foreground"}`}>{value || "—"}</div>
    </div>
  );
}

/** الملف النسائي: extra patient profile for the gynecologist. */
export function GynecologyProfileCard({ patientId }: { patientId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(toForm(null));

  const { data: profile, isLoading } = useQuery({
    queryKey: ["gynecology-profile", patientId],
    queryFn: () => medicalApi.gynecology(patientId),
  });

  useEffect(() => {
    if (open) setForm(toForm(profile));
  }, [open, profile]);

  const save = useMutation({
    mutationFn: () => medicalApi.saveGynecology(patientId, fromForm(form)),
    onSuccess: (p) => {
      queryClient.setQueryData(["gynecology-profile", patientId], p);
      toast({ title: "تم حفظ الملف النسائي" });
      setOpen(false);
    },
    onError: (e) => toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" }),
  });

  const set = (key: keyof Form, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const count = (v: number | null | undefined) => (v == null ? null : String(v));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <HeartPulse className="h-5 w-5 text-pink-600" />
          الملف النسائي
        </CardTitle>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Edit className="h-4 w-4 ms-1" />
          {profile ? "تعديل" : "تعبئة"}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">جاري التحميل...</p>
        ) : !profile ? (
          <p className="text-sm text-muted-foreground">لم يُعبّأ الملف النسائي لهذه المريضة بعد.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              <Value label="التدخين" value={profile.is_smoker == null ? null : profile.is_smoker ? "مدخنة" : "غير مدخنة"} />
              <Value label="الحالة" value={profile.marital_status === "married" ? "متزوجة" : profile.marital_status === "single" ? "عزباء" : null} />
              {COUNTS.map((c) => (
                <Value key={c.key} label={c.label} value={count(profile[c.key])} />
              ))}
              <Value label="الوزن" value={profile.weight_kg != null ? `${profile.weight_kg} كغ` : null} />
              <Value label="الضغط" value={profile.blood_pressure} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 border-t pt-3">
              {HISTORIES.map((h) => (
                <Value key={h.key} label={h.label} value={profile[h.key]} />
              ))}
            </div>
            {profile.updated_at && (
              <p className="text-xs text-muted-foreground">
                آخر تعديل: {fmtDate(profile.updated_at)}
                {profile.editor ? ` — ${profile.editor.full_name || profile.editor.email}` : ""}
              </p>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>الملف النسائي</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <Label>التدخين</Label>
                <Select value={form.is_smoker || "unset"} onValueChange={(v) => set("is_smoker", v === "unset" ? "" : v)} dir="rtl">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">غير محدد</SelectItem>
                    <SelectItem value="yes">مدخنة</SelectItem>
                    <SelectItem value="no">غير مدخنة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>الحالة الاجتماعية</Label>
                <Select value={form.marital_status || "unset"} onValueChange={(v) => set("marital_status", v === "unset" ? "" : v)} dir="rtl">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">غير محدد</SelectItem>
                    <SelectItem value="single">عزباء</SelectItem>
                    <SelectItem value="married">متزوجة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="gyn_weight">الوزن (كغ)</Label>
                <Input id="gyn_weight" inputMode="decimal" value={form.weight_kg} onChange={(e) => set("weight_kg", e.target.value)} placeholder="مثال: 65" />
              </div>
              <div>
                <Label htmlFor="gyn_bp">الضغط</Label>
                <Input id="gyn_bp" dir="ltr" value={form.blood_pressure} onChange={(e) => set("blood_pressure", e.target.value)} placeholder="120/80" />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {COUNTS.map((c) => (
                <div key={c.key}>
                  <Label htmlFor={`gyn_${c.key}`}>{c.label}</Label>
                  <Input
                    id={`gyn_${c.key}`}
                    type="number"
                    min={0}
                    max={50}
                    value={form[c.key]}
                    onChange={(e) => set(c.key, e.target.value)}
                  />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {HISTORIES.map((h) => (
                <div key={h.key}>
                  <Label htmlFor={`gyn_${h.key}`}>{h.label}</Label>
                  <Textarea id={`gyn_${h.key}`} rows={2} value={form[h.key]} onChange={(e) => set(h.key, e.target.value)} placeholder="لا يوجد" />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
