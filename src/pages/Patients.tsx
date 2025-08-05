import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, Plus, Calendar, FileText, Edit, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
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

interface Patient {
  id: string;
  full_name: string;
  date_of_birth: string;
  phone_number: string;
  contact: string | null;
  medical_notes: string | null;
  address: string | null;
  job: string | null;
}

export default function Patients() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [newPatient, setNewPatient] = useState({
    full_name: "",
    date_of_birth: "",
    phone_number: "",
    contact: "",
    medical_notes: "",
    address: "",
    job: "",
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: patients, isLoading } = useQuery({
    queryKey: ["patients", searchTerm],
    queryFn: async () => {
      let query = supabase.from("patients").select("*");
      
      if (searchTerm) {
        query = query.ilike("full_name", `%${searchTerm}%`);
      }
      
      const { data, error } = await query.order("full_name");
      if (error) throw error;
      return data as Patient[];
    },
  });

  const createPatientMutation = useMutation({
    mutationFn: async (patient: typeof newPatient) => {
      const { data, error } = await supabase.from("patients").insert([patient]).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      setIsAddDialogOpen(false);
      setNewPatient({
        full_name: "",
        date_of_birth: "",
        phone_number: "",
        contact: "",
        medical_notes: "",
        address: "",
        job: "",
      });
      toast({
        title: "نجح",
        description: "تم إضافة المريض بنجاح",
      });
    },
    onError: (error) => {
      toast({
        title: "خطأ",
        description: "فشل في إضافة المريض",
        variant: "destructive",
      });
    },
  });

  const updatePatientMutation = useMutation({
    mutationFn: async (patient: Patient) => {
      const { data, error } = await supabase
        .from("patients")
        .update({
          full_name: patient.full_name,
          date_of_birth: patient.date_of_birth,
          phone_number: patient.phone_number,
          contact: patient.contact,
          medical_notes: patient.medical_notes,
          address: patient.address,
          job: patient.job,
        })
        .eq("id", patient.id)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      setIsEditDialogOpen(false);
      setEditingPatient(null);
      toast({
        title: "نجح",
        description: "تم تحديث بيانات المريض بنجاح",
      });
    },
    onError: (error) => {
      toast({
        title: "خطأ",
        description: "فشل في تحديث بيانات المريض",
        variant: "destructive",
      });
    },
  });

  const deletePatientMutation = useMutation({
    mutationFn: async (patientId: string) => {
      const { error } = await supabase.from("patients").delete().eq("id", patientId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      toast({
        title: "نجح",
        description: "تم حذف المريض بنجاح",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل في حذف المريض",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createPatientMutation.mutate(newPatient);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingPatient) {
      updatePatientMutation.mutate(editingPatient);
    }
  };

  const openEditDialog = (patient: Patient) => {
    setEditingPatient(patient);
    setIsEditDialogOpen(true);
  };

  const viewPatientProfile = (patientId: string) => {
    navigate(`/patient-profile/${patientId}`);
  };

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl lg:text-3xl font-bold">المرضى</h1>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <Plus className="ml-2 h-4 w-4" />
              إضافة مريض
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>إضافة مريض جديد</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="full_name">الاسم الكامل</Label>
                <Input
                  id="full_name"
                  value={newPatient.full_name}
                  onChange={(e) => setNewPatient({ ...newPatient, full_name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="date_of_birth">تاريخ الميلاد</Label>
                <Input
                  id="date_of_birth"
                  type="date"
                  value={newPatient.date_of_birth}
                  onChange={(e) => setNewPatient({ ...newPatient, date_of_birth: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="phone_number">رقم الهاتف</Label>
                <Input
                  id="phone_number"
                  value={newPatient.phone_number}
                  onChange={(e) => setNewPatient({ ...newPatient, phone_number: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="contact">جهة اتصال إضافية</Label>
                <Input
                  id="contact"
                  value={newPatient.contact}
                  onChange={(e) => setNewPatient({ ...newPatient, contact: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="address">العنوان</Label>
                <Input
                  id="address"
                  value={newPatient.address}
                  onChange={(e) => setNewPatient({ ...newPatient, address: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="job">المهنة</Label>
                <Input
                  id="job"
                  value={newPatient.job}
                  onChange={(e) => setNewPatient({ ...newPatient, job: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="medical_notes">الملاحظات الطبية</Label>
                <Textarea
                  id="medical_notes"
                  value={newPatient.medical_notes}
                  onChange={(e) => setNewPatient({ ...newPatient, medical_notes: e.target.value })}
                />
              </div>
              <Button type="submit" disabled={createPatientMutation.isPending}>
                {createPatientMutation.isPending ? "جاري الإضافة..." : "إضافة مريض"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>البحث عن المرضى</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="البحث عن المرضى بالاسم..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-10"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>قائمة المرضى</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">جاري تحميل المرضى...</div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الاسم</TableHead>
                      <TableHead>تاريخ الميلاد</TableHead>
                      <TableHead>الهاتف</TableHead>
                      <TableHead>العنوان</TableHead>
                      <TableHead>المهنة</TableHead>
                      <TableHead>جهة الاتصال</TableHead>
                      <TableHead>الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {patients?.map((patient) => (
                      <TableRow key={patient.id}>
                        <TableCell className="font-medium">{patient.full_name}</TableCell>
                        <TableCell>{new Date(patient.date_of_birth).toLocaleDateString()}</TableCell>
                        <TableCell>{patient.phone_number}</TableCell>
                        <TableCell>{patient.address || "-"}</TableCell>
                        <TableCell>{patient.job || "-"}</TableCell>
                        <TableCell>{patient.contact || "-"}</TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditDialog(patient)}
                            >
                              <Edit className="h-4 w-4 ml-1" />
                              تعديل
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => viewPatientProfile(patient.id)}
                            >
                              <FileText className="h-4 w-4 ml-1" />
                              الملف الشخصي
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <Trash2 className="h-4 w-4 ml-1" />
                                  حذف
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    هل أنت متأكد من حذف المريض {patient.full_name}؟ لا يمكن التراجع عن هذا الإجراء.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deletePatientMutation.mutate(patient.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    حذف
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-4">
                {patients?.map((patient) => (
                  <Card key={patient.id} className="p-4">
                    <div className="space-y-3">
                       <div className="flex justify-between items-start">
                         <h3 className="font-semibold text-lg">{patient.full_name}</h3>
                         <div className="flex gap-2">
                           <Button
                             variant="outline"
                             size="sm"
                             onClick={() => openEditDialog(patient)}
                           >
                             <Edit className="h-4 w-4" />
                           </Button>
                           <Button
                             variant="outline"
                             size="sm"
                             onClick={() => viewPatientProfile(patient.id)}
                           >
                             <FileText className="h-4 w-4" />
                           </Button>
                           <AlertDialog>
                             <AlertDialogTrigger asChild>
                               <Button variant="outline" size="sm">
                                 <Trash2 className="h-4 w-4" />
                               </Button>
                             </AlertDialogTrigger>
                             <AlertDialogContent>
                               <AlertDialogHeader>
                                 <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
                                 <AlertDialogDescription>
                                   هل أنت متأكد من حذف المريض {patient.full_name}؟
                                 </AlertDialogDescription>
                               </AlertDialogHeader>
                               <AlertDialogFooter>
                                 <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                 <AlertDialogAction
                                   onClick={() => deletePatientMutation.mutate(patient.id)}
                                   className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                 >
                                   حذف
                                 </AlertDialogAction>
                               </AlertDialogFooter>
                             </AlertDialogContent>
                           </AlertDialog>
                         </div>
                       </div>
                      
                      <div className="grid grid-cols-1 gap-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">تاريخ الميلاد:</span>
                          <span>{new Date(patient.date_of_birth).toLocaleDateString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">الهاتف:</span>
                          <span>{patient.phone_number}</span>
                        </div>
                        {patient.address && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">العنوان:</span>
                            <span className="text-right">{patient.address}</span>
                          </div>
                        )}
                        {patient.job && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">المهنة:</span>
                            <span>{patient.job}</span>
                          </div>
                        )}
                        {patient.contact && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">جهة الاتصال:</span>
                            <span className="text-right">{patient.contact}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل بيانات المريض</DialogTitle>
          </DialogHeader>
          {editingPatient && (
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <Label htmlFor="edit_full_name">الاسم الكامل</Label>
                <Input
                  id="edit_full_name"
                  value={editingPatient.full_name}
                  onChange={(e) => setEditingPatient({ ...editingPatient, full_name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit_date_of_birth">تاريخ الميلاد</Label>
                <Input
                  id="edit_date_of_birth"
                  type="date"
                  value={editingPatient.date_of_birth}
                  onChange={(e) => setEditingPatient({ ...editingPatient, date_of_birth: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit_phone_number">رقم الهاتف</Label>
                <Input
                  id="edit_phone_number"
                  value={editingPatient.phone_number}
                  onChange={(e) => setEditingPatient({ ...editingPatient, phone_number: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit_contact">جهة اتصال إضافية</Label>
                <Input
                  id="edit_contact"
                  value={editingPatient.contact || ""}
                  onChange={(e) => setEditingPatient({ ...editingPatient, contact: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="edit_address">العنوان</Label>
                <Input
                  id="edit_address"
                  value={editingPatient.address || ""}
                  onChange={(e) => setEditingPatient({ ...editingPatient, address: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="edit_job">المهنة</Label>
                <Input
                  id="edit_job"
                  value={editingPatient.job || ""}
                  onChange={(e) => setEditingPatient({ ...editingPatient, job: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="edit_medical_notes">الملاحظات الطبية</Label>
                <Textarea
                  id="edit_medical_notes"
                  value={editingPatient.medical_notes || ""}
                  onChange={(e) => setEditingPatient({ ...editingPatient, medical_notes: e.target.value })}
                />
              </div>
              <Button type="submit" disabled={updatePatientMutation.isPending}>
                {updatePatientMutation.isPending ? "جاري التحديث..." : "تحديث البيانات"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}