import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, Trash2, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { apiErrorMessage, Specialty, specialtiesApi } from "@/api/clinic";

type Form = Pick<Specialty, "name_ar" | "is_dental" | "color" | "sort_order" | "is_active"> & { id?: string; name_en: string };

const empty: Form = { name_ar: "", name_en: "", is_dental: false, color: "#0ea5e9", sort_order: 0, is_active: true };

/** إدارة التخصصات: which specialties exist, and whether they use the tooth chart. */
export default function Specialties() {
  const { isSuperAdmin } = useUserRole();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);

  const { data: specialties = [], isLoading } = useQuery({
    queryKey: ["specialties", "all"],
    queryFn: () => specialtiesApi.list(true),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["specialties"] });

  const save = useMutation({
    mutationFn: (f: Form) => {
      const body = { ...f, name_en: f.name_en || null };
      return f.id ? specialtiesApi.update(f.id, body) : specialtiesApi.create(body);
    },
    onSuccess: () => {
      refresh();
      setForm(null);
      toast({ title: "تم الحفظ", description: "تم حفظ التخصص" });
    },
    onError: (e) => toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => specialtiesApi.remove(id),
    onSuccess: () => {
      refresh();
      toast({ title: "تم الحذف", description: "تم حذف التخصص" });
    },
    onError: (e) => toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" }),
  });

  return (
    <div className="space-y-4 lg:space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Layers className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold">التخصصات</h1>
        </div>
        {isSuperAdmin && (
          <Button onClick={() => setForm({ ...empty, sort_order: specialties.length + 1 })}>
            <Plus className="ml-2 h-4 w-4" />
            إضافة تخصص
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>قائمة التخصصات</CardTitle>
          <CardDescription>
            التخصص يحدد علاجات الطبيب وتقسيم الحسابات. مخطط الأسنان يظهر فقط في تخصصات الأسنان.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">جاري التحميل...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>التخصص</TableHead>
                  <TableHead>مخطط الأسنان</TableHead>
                  <TableHead>الأطباء</TableHead>
                  <TableHead>العلاجات</TableHead>
                  <TableHead>الحالة</TableHead>
                  {isSuperAdmin && <TableHead>الإجراءات</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {specialties.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      <span className="inline-block h-3 w-3 rounded-full ml-2 align-middle" style={{ backgroundColor: s.color ?? "#999" }} />
                      {s.name_ar}
                      {s.name_en && <span className="text-muted-foreground text-xs mr-2">{s.name_en}</span>}
                    </TableCell>
                    <TableCell>{s.is_dental ? "نعم" : "لا"}</TableCell>
                    <TableCell>{s.doctors_count ?? 0}</TableCell>
                    <TableCell>{s.treatments_count ?? 0}</TableCell>
                    <TableCell>
                      <Badge variant={s.is_active ? "default" : "outline"}>{s.is_active ? "فعال" : "موقوف"}</Badge>
                    </TableCell>
                    {isSuperAdmin && (
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setForm({ id: s.id, name_ar: s.name_ar, name_en: s.name_en ?? "", is_dental: s.is_dental, color: s.color, sort_order: s.sort_order, is_active: s.is_active })}
                          >
                            <Edit className="h-4 w-4 ml-1" />
                            تعديل
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={(s.doctors_count ?? 0) > 0 || (s.treatments_count ?? 0) > 0}
                            title="لا يمكن حذف تخصص مرتبط بأطباء أو علاجات — أوقفه بدلاً من ذلك"
                            onClick={() => remove.mutate(s.id)}
                          >
                            <Trash2 className="h-4 w-4 ml-1" />
                            حذف
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form?.id ? "تعديل تخصص" : "إضافة تخصص"}</DialogTitle>
          </DialogHeader>
          {form && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate(form);
              }}
            >
              <div>
                <Label htmlFor="sp_name_ar">الاسم بالعربية</Label>
                <Input id="sp_name_ar" required value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="sp_name_en">الاسم بالإنجليزية (اختياري)</Label>
                <Input id="sp_name_en" dir="ltr" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label htmlFor="sp_dental">تخصص أسنان</Label>
                  <p className="text-xs text-muted-foreground">يظهر مخطط الأسنان واختيار السن في علاجات هذا التخصص</p>
                </div>
                <Switch id="sp_dental" checked={form.is_dental} onCheckedChange={(v) => setForm({ ...form, is_dental: v })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="sp_color">اللون</Label>
                  <Input id="sp_color" type="color" value={form.color ?? "#0ea5e9"} onChange={(e) => setForm({ ...form, color: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="sp_order">الترتيب</Label>
                  <Input id="sp_order" type="number" min={0} value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label htmlFor="sp_active">فعال</Label>
                <Switch id="sp_active" checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              </div>
              <DialogFooter>
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
    </div>
  );
}
