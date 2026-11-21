import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageIcon, Printer, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { apiErrorMessage, ClinicSettings, clinicSettingsApi } from "@/api/clinic";

type Form = Omit<ClinicSettings, "has_logo">;
type TextKey = keyof Form;

const emptyForm: Form = {
  clinic_name: "",
  clinic_name_en: "",
  clinic_address: "",
  clinic_phone: "",
  prescription_footer: "",
};

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** إعدادات الطباعة: the clinic header printed on top of every prescription. */
export function ClinicPrintSettings() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [logoVersion, setLogoVersion] = useState(() => Date.now());

  const { data: settings, isLoading } = useQuery({
    queryKey: ["clinic-settings"],
    queryFn: clinicSettingsApi.get,
  });

  useEffect(() => {
    if (!settings) return;
    setForm({
      clinic_name: settings.clinic_name ?? "",
      clinic_name_en: settings.clinic_name_en ?? "",
      clinic_address: settings.clinic_address ?? "",
      clinic_phone: settings.clinic_phone ?? "",
      prescription_footer: settings.prescription_footer ?? "",
    });
  }, [settings]);

  const onSaved = (data: ClinicSettings) => queryClient.setQueryData(["clinic-settings"], data);
  const onError = (e: unknown) => toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" });

  const save = useMutation({
    mutationFn: (f: Form) => {
      const body = Object.fromEntries(
        Object.entries(f).map(([k, v]) => [k, typeof v === "string" && v.trim() ? v.trim() : null]),
      ) as Form;
      return clinicSettingsApi.update(body);
    },
    onSuccess: (data) => {
      onSaved(data);
      toast({ title: "تم الحفظ", description: "تم حفظ بيانات العيادة" });
    },
    onError,
  });

  const upload = useMutation({
    mutationFn: (file: File) => clinicSettingsApi.uploadLogo(file),
    onSuccess: (data) => {
      onSaved(data);
      setLogoVersion(Date.now());
      toast({ title: "تم الرفع", description: "تم تحديث شعار العيادة" });
    },
    onError,
    onSettled: () => {
      if (fileRef.current) fileRef.current.value = "";
    },
  });

  const removeLogo = useMutation({
    mutationFn: () => clinicSettingsApi.removeLogo(),
    onSuccess: (data) => {
      onSaved(data);
      setLogoVersion(Date.now());
      toast({ title: "تم الحذف", description: "تم حذف الشعار" });
    },
    onError,
  });

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      toast({ title: "خطأ", description: "الصيغ المسموحة: PNG أو JPG أو WEBP", variant: "destructive" });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast({ title: "خطأ", description: "حجم الشعار يجب ألا يتجاوز 2 ميغابايت", variant: "destructive" });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    upload.mutate(file);
  };

  const field = (key: TextKey, label: string, opts: { dir?: "ltr" | "rtl"; placeholder?: string } = {}) => (
    <div>
      <Label htmlFor={`cs_${key}`}>{label}</Label>
      <Input
        id={`cs_${key}`}
        dir={opts.dir}
        placeholder={opts.placeholder}
        value={form[key] ?? ""}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </div>
  );

  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Printer className="h-5 w-5" />
          إعدادات الطباعة
        </CardTitle>
        <CardDescription>تظهر هذه البيانات في أعلى كل وصفة مطبوعة (A4)</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8">جاري التحميل...</div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            <form
              className="space-y-4 lg:col-span-2"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate(form);
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                {field("clinic_name", "اسم العيادة")}
                {field("clinic_name_en", "اسم العيادة بالإنجليزية (اختياري)", { dir: "ltr" })}
                {field("clinic_address", "العنوان")}
                {field("clinic_phone", "الهاتف", { dir: "ltr" })}
              </div>
              <div>
                <Label htmlFor="cs_prescription_footer">تذييل الوصفة</Label>
                <Textarea
                  id="cs_prescription_footer"
                  rows={3}
                  maxLength={500}
                  placeholder="مواعيد الدوام: يومياً من 9 صباحاً حتى 5 مساءً ما عدا الجمعة"
                  value={form.prescription_footer ?? ""}
                  onChange={(e) => setForm({ ...form, prescription_footer: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">يظهر في أسفل الوصفة المطبوعة</p>
              </div>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "جاري الحفظ..." : "حفظ"}
              </Button>
            </form>

            <div className="space-y-3">
              <Label>شعار العيادة</Label>
              <div className="flex h-36 items-center justify-center rounded-md border bg-muted/30 p-2">
                {settings?.has_logo ? (
                  <img
                    src={clinicSettingsApi.logoUrl(logoVersion)}
                    alt="شعار العيادة"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-sm text-muted-foreground">
                    <ImageIcon className="h-8 w-8" />
                    لا يوجد شعار
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4 ml-1" />
                  {upload.isPending ? "جاري الرفع..." : settings?.has_logo ? "تغيير الشعار" : "رفع شعار"}
                </Button>
                {settings?.has_logo && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={removeLogo.isPending}
                    onClick={() => removeLogo.mutate()}
                  >
                    <Trash2 className="h-4 w-4 ml-1" />
                    حذف الشعار
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">PNG أو JPG أو WEBP، بحجم 2 ميغابايت كحد أقصى</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
