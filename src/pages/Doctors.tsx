import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Plus, Edit, Eye, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUserRole } from "@/hooks/useUserRole";
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
import { adminApi, apiErrorMessage, Doctor, doctorsApi, Specialty, specialtiesApi } from "@/api/clinic";

const NO_USER = "__none__";

interface DoctorForm {
  id?: string;
  full_name: string;
  email: string;
  phone_number: string;
  specialty_ids: string[];
  primary_specialty_id: string | null;
  user_id: string | null;
  has_own_books: boolean;
}

const emptyForm: DoctorForm = {
  full_name: "",
  email: "",
  phone_number: "",
  specialty_ids: [],
  primary_specialty_id: null,
  user_id: null,
  has_own_books: false,
};

function SpecialtyChips({ doctor }: { doctor: Doctor }) {
  if (!doctor.specialties.length) return <span className="text-muted-foreground">{doctor.specialty ?? "-"}</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {doctor.specialties.map((s) => (
        <Badge
          key={s.id}
          variant={s.is_primary ? "default" : "outline"}
          style={s.is_primary && s.color ? { backgroundColor: s.color } : undefined}
        >
          {s.name_ar}
        </Badge>
      ))}
    </div>
  );
}

/** Checkboxes for the doctor's specialties + which one is primary. */
function SpecialtyPicker({
  specialties,
  form,
  setForm,
}: {
  specialties: Specialty[];
  form: DoctorForm;
  setForm: (f: DoctorForm) => void;
}) {
  const toggle = (id: string, checked: boolean) => {
    const ids = checked ? [...form.specialty_ids, id] : form.specialty_ids.filter((x) => x !== id);
    const primary = ids.includes(form.primary_specialty_id ?? "") ? form.primary_specialty_id : ids[0] ?? null;
    setForm({ ...form, specialty_ids: ids, primary_specialty_id: primary });
  };

  return (
    <div className="space-y-2">
      <Label>التخصصات</Label>
      <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
        {specialties.map((s) => (
          <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={form.specialty_ids.includes(s.id)} onCheckedChange={(c) => toggle(s.id, c === true)} />
            {s.name_ar}
          </label>
        ))}
      </div>
      {form.specialty_ids.length > 1 && (
        <div>
          <Label>التخصص الرئيسي</Label>
          <Select value={form.primary_specialty_id ?? undefined} onValueChange={(v) => setForm({ ...form, primary_specialty_id: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {specialties
                .filter((s) => form.specialty_ids.includes(s.id))
                .map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name_ar}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

export default function Doctors() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [newDoctor, setNewDoctor] = useState<DoctorForm>(emptyForm);
  const [editingDoctor, setEditingDoctor] = useState<DoctorForm | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { isSuperAdmin } = useUserRole();

  // Logins with the "doctor" role, so a doctor record can be linked to a login
  const { data: doctorUsers } = useQuery({
    queryKey: ["doctor-role-users"],
    enabled: isSuperAdmin,
    queryFn: () => adminApi.users("doctor"),
  });

  const { data: specialties = [] } = useQuery({ queryKey: ["specialties"], queryFn: () => specialtiesApi.list() });

  const { data: allDoctors, isLoading } = useQuery({ queryKey: ["doctors"], queryFn: () => doctorsApi.list() });

  const doctors = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return allDoctors;
    return allDoctors?.filter(
      (d) => d.full_name.toLowerCase().includes(q) || d.specialties.some((s) => s.name_ar.toLowerCase().includes(q)),
    );
  }, [allDoctors, searchTerm]);

  const openAddDialog = (open: boolean) => {
    setIsAddDialogOpen(open);
    if (open) {
      const dental = specialties.find((s) => s.is_dental) ?? specialties[0];
      setNewDoctor({ ...emptyForm, specialty_ids: dental ? [dental.id] : [], primary_specialty_id: dental?.id ?? null });
    }
  };

  const toPayload = (f: DoctorForm) => ({
    full_name: f.full_name,
    email: f.email || null,
    phone_number: f.phone_number || null,
    specialty_ids: f.specialty_ids,
    primary_specialty_id: f.primary_specialty_id,
    ...(isSuperAdmin ? { user_id: f.user_id, has_own_books: f.has_own_books } : {}),
  });

  const createDoctorMutation = useMutation({
    mutationFn: (f: DoctorForm) => doctorsApi.create(toPayload(f)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doctors"] });
      setIsAddDialogOpen(false);
      toast({ title: "نجح", description: "تم إضافة الدكتور بنجاح" });
    },
    onError: (e) => toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" }),
  });

  const updateDoctorMutation = useMutation({
    mutationFn: (f: DoctorForm) => doctorsApi.update(f.id!, toPayload(f)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doctors"] });
      setIsEditDialogOpen(false);
      setEditingDoctor(null);
      toast({ title: "نجح", description: "تم تحديث بيانات الدكتور بنجاح" });
    },
    onError: (e) => toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" }),
  });

  const deleteDoctorMutation = useMutation({
    mutationFn: (doctorId: string) => doctorsApi.remove(doctorId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doctors"] });
      toast({ title: "نجح", description: "تم حذف الدكتور بنجاح" });
    },
    onError: (e) => toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDoctor.specialty_ids.length) {
      toast({ title: "خطأ", description: "اختر تخصصاً واحداً على الأقل", variant: "destructive" });
      return;
    }
    createDoctorMutation.mutate(newDoctor);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDoctor) return;
    if (!editingDoctor.specialty_ids.length) {
      toast({ title: "خطأ", description: "اختر تخصصاً واحداً على الأقل", variant: "destructive" });
      return;
    }
    updateDoctorMutation.mutate(editingDoctor);
  };

  const openEditDialog = (doctor: Doctor) => {
    setEditingDoctor({
      id: doctor.id,
      full_name: doctor.full_name,
      email: doctor.email ?? "",
      phone_number: doctor.phone_number ?? "",
      specialty_ids: doctor.specialties.map((s) => s.id),
      primary_specialty_id: doctor.primary_specialty_id,
      user_id: doctor.user_id,
      has_own_books: doctor.has_own_books,
    });
    setIsEditDialogOpen(true);
  };

  const viewDoctorAppointments = (doctorId: string) => navigate(`/doctor-profile/${doctorId}`);

  const deleteButton = (doctor: Doctor, compact: boolean) => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Trash2 className={compact ? "h-4 w-4" : "h-4 w-4 ml-1"} />
          {!compact && "حذف"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
          <AlertDialogDescription>
            هل أنت متأكد من حذف الدكتور {doctor.full_name}؟ تبقى مواعيده وحساباته السابقة محفوظة.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>إلغاء</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deleteDoctorMutation.mutate(doctor.id)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            حذف
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const basicFields = (form: DoctorForm, setForm: (f: DoctorForm) => void, prefix: string) => (
    <>
      <div>
        <Label htmlFor={`${prefix}full_name`}>الاسم الكامل</Label>
        <Input id={`${prefix}full_name`} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
      </div>
      <div>
        <Label htmlFor={`${prefix}email`}>البريد الإلكتروني</Label>
        <Input id={`${prefix}email`} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </div>
      <div>
        <Label htmlFor={`${prefix}phone_number`}>رقم الهاتف</Label>
        <Input id={`${prefix}phone_number`} value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} />
      </div>
      <SpecialtyPicker specialties={specialties} form={form} setForm={setForm} />
    </>
  );

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl lg:text-3xl font-bold">الأطباء</h1>
        {isSuperAdmin && (
          <Dialog open={isAddDialogOpen} onOpenChange={openAddDialog}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto">
                <Plus className="ml-2 h-4 w-4" />
                إضافة دكتور
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>إضافة دكتور جديد</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                {basicFields(newDoctor, setNewDoctor, "")}
                <Button type="submit" disabled={createDoctorMutation.isPending}>
                  {createDoctorMutation.isPending ? "جاري الإضافة..." : "إضافة دكتور"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>البحث عن الأطباء</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="البحث عن الأطباء بالاسم أو التخصص..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-10"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>قائمة الأطباء</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">جاري تحميل الأطباء...</div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الاسم</TableHead>
                      <TableHead>البريد الإلكتروني</TableHead>
                      <TableHead>الهاتف</TableHead>
                      <TableHead>التخصص</TableHead>
                      <TableHead>الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {doctors?.map((doctor) => (
                      <TableRow key={doctor.id}>
                        <TableCell className="font-medium">
                          {doctor.full_name}
                          {doctor.has_own_books && (
                            <Badge variant="secondary" className="mr-2">حسابات مستقلة</Badge>
                          )}
                        </TableCell>
                        <TableCell>{doctor.email}</TableCell>
                        <TableCell>{doctor.phone_number}</TableCell>
                        <TableCell>
                          <SpecialtyChips doctor={doctor} />
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button variant="outline" size="sm" onClick={() => viewDoctorAppointments(doctor.id)}>
                              <Eye className="h-4 w-4 ml-1" />
                              المواعيد
                            </Button>
                            {isSuperAdmin && (
                              <>
                                <Button variant="outline" size="sm" onClick={() => openEditDialog(doctor)}>
                                  <Edit className="h-4 w-4 ml-1" />
                                  تعديل
                                </Button>
                                {deleteButton(doctor, false)}
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-4">
                {doctors?.map((doctor) => (
                  <Card key={doctor.id} className="p-4">
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-semibold text-lg">
                            {doctor.full_name}
                            {doctor.has_own_books && (
                              <Badge variant="secondary" className="mr-2">حسابات مستقلة</Badge>
                            )}
                          </h3>
                          <SpecialtyChips doctor={doctor} />
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => viewDoctorAppointments(doctor.id)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {isSuperAdmin && (
                            <>
                              <Button variant="outline" size="sm" onClick={() => openEditDialog(doctor)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              {deleteButton(doctor, true)}
                            </>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">البريد الإلكتروني:</span>
                          <span className="text-right">{doctor.email}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">الهاتف:</span>
                          <span>{doctor.phone_number}</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تعديل بيانات الدكتور</DialogTitle>
          </DialogHeader>
          {editingDoctor && (
            <form onSubmit={handleEditSubmit} className="space-y-4">
              {basicFields(editingDoctor, (f) => setEditingDoctor(f), "edit_")}
              {isSuperAdmin && (
                <>
                  <div>
                    <Label>حساب الدخول المرتبط</Label>
                    <Select
                      value={editingDoctor.user_id ?? NO_USER}
                      onValueChange={(v) => setEditingDoctor({ ...editingDoctor, user_id: v === NO_USER ? null : v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_USER}>بدون حساب</SelectItem>
                        {doctorUsers?.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.full_name || u.email} {u.full_name && u.email ? `(${u.email})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">المستخدمون الذين لديهم دور "طبيب" فقط</p>
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <Label htmlFor="edit_has_own_books">حسابات مستقلة</Label>
                      <p className="text-xs text-muted-foreground">
                        علاجات خاصة وحسابات مالية منفصلة (مثل طبيب الأطفال). يشارك المرضى وغرفة الانتظار.
                      </p>
                    </div>
                    <Switch
                      id="edit_has_own_books"
                      checked={editingDoctor.has_own_books}
                      onCheckedChange={(checked) => setEditingDoctor({ ...editingDoctor, has_own_books: checked })}
                    />
                  </div>
                </>
              )}
              <Button type="submit" disabled={updateDoctorMutation.isPending}>
                {updateDoctorMutation.isPending ? "جاري التحديث..." : "تحديث البيانات"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
