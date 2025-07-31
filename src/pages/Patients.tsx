import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, Plus, Calendar, FileText } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

interface Patient {
  id: string;
  full_name: string;
  date_of_birth: string;
  phone_number: string;
  contact: string | null;
  medical_notes: string | null;
}

export default function Patients() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newPatient, setNewPatient] = useState({
    full_name: "",
    date_of_birth: "",
    phone_number: "",
    contact: "",
    medical_notes: "",
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createPatientMutation.mutate(newPatient);
  };

  const viewPatientProfile = (patientId: string) => {
    navigate(`/patient-profile/${patientId}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">المرضى</h1>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
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
            <div>جاري تحميل المرضى...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>تاريخ الميلاد</TableHead>
                  <TableHead>الهاتف</TableHead>
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
                    <TableCell>{patient.contact || "-"}</TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => viewPatientProfile(patient.id)}
                        >
                          <FileText className="h-4 w-4 ml-1" />
                          الملف الشخصي
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}