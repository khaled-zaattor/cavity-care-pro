import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, Plus, Edit, Eye, Trash2, UserCheck } from "lucide-react";
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

interface Doctor {
  id: string;
  full_name: string;
  email: string;
  phone_number: string;
  specialty: string;
  created_at: string;
  updated_at: string;
}

export default function Doctors() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);
  const [newDoctor, setNewDoctor] = useState({
    full_name: "",
    email: "",
    phone_number: "",
    specialty: "",
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: doctors, isLoading } = useQuery({
    queryKey: ["doctors", searchTerm],
    queryFn: async () => {
      let query = supabase.from("doctors").select("*");
      
      if (searchTerm) {
        query = query.or(`full_name.ilike.%${searchTerm}%,specialty.ilike.%${searchTerm}%`);
      }
      
      const { data, error } = await query.order("full_name");
      if (error) throw error;
      return data as Doctor[];
    },
  });

  const createDoctorMutation = useMutation({
    mutationFn: async (doctor: typeof newDoctor) => {
      const { data, error } = await supabase.from("doctors").insert([doctor]).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doctors"] });
      setIsAddDialogOpen(false);
      setNewDoctor({
        full_name: "",
        email: "",
        phone_number: "",
        specialty: "",
      });
      toast({
        title: "نجح",
        description: "تم إضافة الدكتور بنجاح",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل في إضافة الدكتور",
        variant: "destructive",
      });
    },
  });

  const updateDoctorMutation = useMutation({
    mutationFn: async (doctor: Doctor) => {
      const { data, error } = await supabase
        .from("doctors")
        .update({
          full_name: doctor.full_name,
          email: doctor.email,
          phone_number: doctor.phone_number,
          specialty: doctor.specialty,
        })
        .eq("id", doctor.id)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doctors"] });
      setIsEditDialogOpen(false);
      setEditingDoctor(null);
      toast({
        title: "نجح",
        description: "تم تحديث بيانات الدكتور بنجاح",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل في تحديث بيانات الدكتور",
        variant: "destructive",
      });
    },
  });

  const deleteDoctorMutation = useMutation({
    mutationFn: async (doctorId: string) => {
      const { error } = await supabase.from("doctors").delete().eq("id", doctorId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doctors"] });
      toast({
        title: "نجح",
        description: "تم حذف الدكتور بنجاح",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل في حذف الدكتور",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createDoctorMutation.mutate(newDoctor);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingDoctor) {
      updateDoctorMutation.mutate(editingDoctor);
    }
  };

  const openEditDialog = (doctor: Doctor) => {
    setEditingDoctor(doctor);
    setIsEditDialogOpen(true);
  };

  const viewDoctorAppointments = (doctorId: string) => {
    navigate(`/doctor-profile/${doctorId}`);
  };

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl lg:text-3xl font-bold">الأطباء</h1>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
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
              <div>
                <Label htmlFor="full_name">الاسم الكامل</Label>
                <Input
                  id="full_name"
                  value={newDoctor.full_name}
                  onChange={(e) => setNewDoctor({ ...newDoctor, full_name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input
                  id="email"
                  type="email"
                  value={newDoctor.email}
                  onChange={(e) => setNewDoctor({ ...newDoctor, email: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="phone_number">رقم الهاتف</Label>
                <Input
                  id="phone_number"
                  value={newDoctor.phone_number}
                  onChange={(e) => setNewDoctor({ ...newDoctor, phone_number: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="specialty">التخصص</Label>
                <Input
                  id="specialty"
                  value={newDoctor.specialty}
                  onChange={(e) => setNewDoctor({ ...newDoctor, specialty: e.target.value })}
                  required
                />
              </div>
              <Button type="submit" disabled={createDoctorMutation.isPending}>
                {createDoctorMutation.isPending ? "جاري الإضافة..." : "إضافة دكتور"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
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
                        <TableCell className="font-medium">{doctor.full_name}</TableCell>
                        <TableCell>{doctor.email}</TableCell>
                        <TableCell>{doctor.phone_number}</TableCell>
                        <TableCell>{doctor.specialty}</TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => viewDoctorAppointments(doctor.id)}
                            >
                              <Eye className="h-4 w-4 ml-1" />
                              المواعيد
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditDialog(doctor)}
                            >
                              <Edit className="h-4 w-4 ml-1" />
                              تعديل
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
                                    هل أنت متأكد من حذف الدكتور {doctor.full_name}؟ لا يمكن التراجع عن هذا الإجراء.
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
                          <h3 className="font-semibold text-lg">{doctor.full_name}</h3>
                          <p className="text-sm text-muted-foreground">{doctor.specialty}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => viewDoctorAppointments(doctor.id)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditDialog(doctor)}
                          >
                            <Edit className="h-4 w-4" />
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
                                  هل أنت متأكد من حذف الدكتور {doctor.full_name}؟
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل بيانات الدكتور</DialogTitle>
          </DialogHeader>
          {editingDoctor && (
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <Label htmlFor="edit_full_name">الاسم الكامل</Label>
                <Input
                  id="edit_full_name"
                  value={editingDoctor.full_name}
                  onChange={(e) => setEditingDoctor({ ...editingDoctor, full_name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit_email">البريد الإلكتروني</Label>
                <Input
                  id="edit_email"
                  type="email"
                  value={editingDoctor.email}
                  onChange={(e) => setEditingDoctor({ ...editingDoctor, email: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit_phone_number">رقم الهاتف</Label>
                <Input
                  id="edit_phone_number"
                  value={editingDoctor.phone_number}
                  onChange={(e) => setEditingDoctor({ ...editingDoctor, phone_number: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit_specialty">التخصص</Label>
                <Input
                  id="edit_specialty"
                  value={editingDoctor.specialty}
                  onChange={(e) => setEditingDoctor({ ...editingDoctor, specialty: e.target.value })}
                  required
                />
              </div>
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