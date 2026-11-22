import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Clock, Edit, LogIn, LogOut, Plus, Trash2 } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { apiErrorMessage, attendanceApi, AttendanceRow, doctorsApi } from "@/api/clinic";

const errorToast = (e: unknown) => toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" });
const hm = (minutes: number | null | undefined) => {
  if (minutes === null || minutes === undefined) return "—";
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)} س ${m % 60} د`;
};
const time = (iso: string | null | undefined) => (iso ? format(new Date(iso), "HH:mm") : "—");

interface ManualForm {
  id?: string;
  doctor_id: string;
  date: string;
  check_in: string;
  check_out: string;
  notes: string;
}

/** حضور الأطباء: live check-in/out, and the history that splits shared charges by hours. */
export default function Attendance() {
  const { userRole, isSuperAdmin, isLoading: roleLoading } = useUserRole();
  const queryClient = useQueryClient();
  const now = new Date();
  const [from, setFrom] = useState(format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(now, "yyyy-MM-dd"));
  const [doctorFilter, setDoctorFilter] = useState("all");
  const [form, setForm] = useState<ManualForm | null>(null);

  const isDoctor = userRole === "doctor";

  const { data: today, isLoading: todayLoading } = useQuery({
    queryKey: ["attendance-today"],
    queryFn: () => attendanceApi.today(),
    refetchInterval: 30_000,
    enabled: !roleLoading,
  });

  const params = { from, to, doctor_id: doctorFilter === "all" ? undefined : doctorFilter };
  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["attendance", params],
    queryFn: () => attendanceApi.list(params),
    enabled: !roleLoading,
  });

  const { data: doctors = [] } = useQuery({
    queryKey: ["doctors", "finance-list"],
    queryFn: () => doctorsApi.list(),
    enabled: !roleLoading && !isDoctor,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["attendance-today"] });
    queryClient.invalidateQueries({ queryKey: ["attendance"] });
    queryClient.invalidateQueries({ queryKey: ["settlement"] });
  };

  const clock = useMutation({
    mutationFn: ({ doctorId, action }: { doctorId: string; action: "in" | "out" }) =>
      action === "in" ? attendanceApi.checkIn(doctorId) : attendanceApi.checkOut(doctorId),
    onSuccess: (_d, v) => {
      refresh();
      toast({ title: "تم", description: v.action === "in" ? "تم تسجيل الحضور" : "تم تسجيل الانصراف" });
    },
    onError: errorToast,
  });

  const save = useMutation({
    mutationFn: (f: ManualForm) =>
      f.id
        ? attendanceApi.update(f.id, { check_in: f.check_in, check_out: f.check_out, notes: f.notes.trim() || null })
        : attendanceApi.add({ doctor_id: f.doctor_id, date: f.date, check_in: f.check_in, check_out: f.check_out, notes: f.notes.trim() || null }),
    onSuccess: () => {
      refresh();
      setForm(null);
      toast({ title: "تم الحفظ", description: "تم حفظ الحضور" });
    },
    onError: errorToast,
  });

  const remove = useMutation({
    mutationFn: (id: string) => attendanceApi.remove(id),
    onSuccess: () => {
      refresh();
      toast({ title: "تم الحذف", description: "تم حذف سجل الحضور" });
    },
    onError: errorToast,
  });

  const submit = () => {
    if (!form) return;
    if (!form.id && (!form.doctor_id || !form.date))
      return toast({ title: "تنبيه", description: "اختر الطبيب والتاريخ", variant: "destructive" });
    if (!form.check_in || !form.check_out) return toast({ title: "تنبيه", description: "أدخل وقت الحضور والانصراف", variant: "destructive" });
    if (form.check_out <= form.check_in)
      return toast({ title: "تنبيه", description: "وقت الانصراف يجب أن يكون بعد وقت الحضور", variant: "destructive" });
    save.mutate(form);
  };

  const rows = history?.data ?? [];
  const hoursByDoctor = Object.entries(history?.hours_by_doctor ?? {});
  const nameOf = (id: string) =>
    rows.find((r) => r.doctor_id === id)?.doctor?.full_name ?? doctors.find((d) => d.id === id)?.full_name ?? today?.data.find((t) => t.doctor_id === id)?.doctor_name ?? "-";

  if (roleLoading) return <p className="text-muted-foreground p-6">جاري التحميل...</p>;

  return (
    <div className="space-y-4 lg:space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <Clock className="h-5 w-5 text-primary" />
        </div>
        <h1 className="text-2xl lg:text-3xl font-bold">حضور الأطباء</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>اليوم {today?.date ? `(${today.date})` : ""}</CardTitle>
          <CardDescription>ساعات الحضور تُستخدم لتوزيع الإيجار والمصاريف المشتركة بين الأطباء.</CardDescription>
        </CardHeader>
        <CardContent>
          {todayLoading ? (
            <div className="text-center py-8">جاري التحميل...</div>
          ) : !today?.data.length ? (
            <div className="text-center py-8 text-muted-foreground">{isDoctor ? "حسابك غير مرتبط بطبيب." : "لا يوجد أطباء"}</div>
          ) : (
            <div className="divide-y">
              {today.data.map((t) => (
                <div key={t.doctor_id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="font-medium min-w-[10rem]">{t.doctor_name}</span>
                  {t.checked_in ? (
                    <Badge className="bg-green-600 hover:bg-green-600">موجود منذ {time(t.open_since)}</Badge>
                  ) : (
                    <Badge variant="outline">غير موجود</Badge>
                  )}
                  <span className="text-muted-foreground text-sm">اليوم: {hm(t.today_minutes)}</span>
                  <Button
                    size="lg"
                    className="ms-auto min-w-[10rem]"
                    variant={t.checked_in ? "outline" : "default"}
                    disabled={clock.isPending}
                    onClick={() => clock.mutate({ doctorId: t.doctor_id, action: t.checked_in ? "out" : "in" })}
                  >
                    {t.checked_in ? (
                      <>
                        <LogOut className="h-4 w-4 ml-2" />
                        تسجيل انصراف
                      </>
                    ) : (
                      <>
                        <LogIn className="h-4 w-4 ml-2" />
                        تسجيل حضور
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <CardTitle>السجل</CardTitle>
            {isSuperAdmin && (
              <Button
                onClick={() =>
                  setForm({ doctor_id: doctorFilter === "all" ? "" : doctorFilter, date: format(new Date(), "yyyy-MM-dd"), check_in: "09:00", check_out: "17:00", notes: "" })
                }
              >
                <Plus className="h-4 w-4 ml-2" />
                إضافة يوم يدوياً
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div>
              <Label htmlFor="att_from">من تاريخ</Label>
              <Input id="att_from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="att_to">إلى تاريخ</Label>
              <Input id="att_to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            {!isDoctor && (
              <div>
                <Label>الطبيب</Label>
                <Select value={doctorFilter} onValueChange={setDoctorFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الأطباء</SelectItem>
                    {doctors.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {hoursByDoctor.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {hoursByDoctor.map(([id, hours]) => (
                <Badge key={id} variant="secondary" className="text-sm">
                  {nameOf(id)}: {hm(Number(hours) * 60)}
                </Badge>
              ))}
            </div>
          )}
          <div className="overflow-x-auto">
            {historyLoading ? (
              <div className="text-center py-8">جاري التحميل...</div>
            ) : !rows.length ? (
              <div className="text-center py-8 text-muted-foreground">لا توجد سجلات حضور في هذه الفترة</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>الطبيب</TableHead>
                    <TableHead>الحضور</TableHead>
                    <TableHead>الانصراف</TableHead>
                    <TableHead>المدة</TableHead>
                    <TableHead>المصدر</TableHead>
                    <TableHead>ملاحظات</TableHead>
                    {isSuperAdmin && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r: AttendanceRow) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">{r.date?.slice(0, 10)}</TableCell>
                      <TableCell className="font-medium">{r.doctor?.full_name ?? nameOf(r.doctor_id)}</TableCell>
                      <TableCell>{time(r.check_in)}</TableCell>
                      <TableCell>{r.check_out ? time(r.check_out) : <Badge variant="outline">لم ينصرف بعد</Badge>}</TableCell>
                      <TableCell>{hm(r.minutes)}</TableCell>
                      <TableCell>{r.source === "manual" && <Badge variant="secondary">يدوي</Badge>}</TableCell>
                      <TableCell className="max-w-xs truncate">{r.notes ?? ""}</TableCell>
                      {isSuperAdmin && (
                        <TableCell className="whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="تعديل"
                            onClick={() =>
                              setForm({
                                id: r.id,
                                doctor_id: r.doctor_id,
                                date: r.date?.slice(0, 10),
                                check_in: time(r.check_in),
                                check_out: r.check_out ? time(r.check_out) : "",
                                notes: r.notes ?? "",
                              })
                            }
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" title="حذف">
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent dir="rtl">
                              <AlertDialogHeader>
                                <AlertDialogTitle>حذف سجل الحضور؟</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {r.doctor?.full_name ?? nameOf(r.doctor_id)} — {r.date?.slice(0, 10)} ({hm(r.minutes)}). لا يمكن التراجع عن هذا الإجراء.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter className="gap-2">
                                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                <AlertDialogAction onClick={() => remove.mutate(r.id)}>حذف</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form?.id ? "تعديل الحضور" : "إضافة يوم يدوياً"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="grid grid-cols-2 gap-4">
              {form.id ? (
                <p className="col-span-2 text-sm text-muted-foreground">
                  {nameOf(form.doctor_id)} — {form.date}
                </p>
              ) : (
                <>
                  <div className="col-span-2">
                    <Label>الطبيب</Label>
                    <Select value={form.doctor_id || undefined} onValueChange={(v) => setForm({ ...form, doctor_id: v })}>
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
                  <div className="col-span-2">
                    <Label htmlFor="man_date">التاريخ</Label>
                    <Input id="man_date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                  </div>
                </>
              )}
              <div>
                <Label htmlFor="man_in">من</Label>
                <Input id="man_in" type="time" value={form.check_in} onChange={(e) => setForm({ ...form, check_in: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="man_out">إلى</Label>
                <Input id="man_out" type="time" value={form.check_out} onChange={(e) => setForm({ ...form, check_out: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label htmlFor="man_notes">ملاحظات</Label>
                <Textarea id="man_notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setForm(null)}>
              إلغاء
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
