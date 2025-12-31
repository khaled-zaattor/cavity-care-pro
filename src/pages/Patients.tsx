import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, Plus, Calendar, FileText, Edit, Trash2, FileDown, Upload, ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { format, isValid, parseISO } from "date-fns";

const formatDateSafe = (dateString: string | null | undefined): string => {
  if (!dateString) return "-";
  try {
    const date = parseISO(dateString);
    if (!isValid(date)) return "-";
    return format(date, 'dd/MM/yyyy');
  } catch {
    return "-";
  }
};
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
  const [currentPage, setCurrentPage] = useState(1);
  const [filterMode, setFilterMode] = useState<"all" | "duplicates" | "no_appointments">("all");
  const itemsPerPage = 20;
  const [newPatient, setNewPatient] = useState({
    full_name: "",
    date_of_birth: "",
    phone_number: "",
    contact: "",
    medical_notes: "",
    address: "",
    job: "",
  });
  const [importingFile, setImportingFile] = useState(false);
  
  const exportToExcel = async () => {
    try {
      // جلب المرضى على دفعات لتجاوز حد 1000 صف لكل طلب
      const pageSize = 1000;
      let offset = 0;
      let allPatients: any[] = [];

      while (true) {
        const { data, error } = await supabase
          .from("patients")
          .select("*")
          .order("full_name")
          .range(offset, offset + pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        allPatients = allPatients.concat(data);
        if (data.length < pageSize) break; // آخر دفعة
        offset += pageSize;
      }

      if (!allPatients || allPatients.length === 0) {
        toast({ title: "لا توجد بيانات", description: "لا يوجد مرضى للتصدير" });
        return;
      }
      
      // تحويل البيانات إلى تنسيق مناسب للإكسل
      const dataForExcel = allPatients.map((patient) => ({
        'الاسم': patient.full_name,
        'تاريخ الميلاد': formatDateSafe(patient.date_of_birth),
        'الهاتف': patient.phone_number,
        'العنوان': patient.address || '-',
        'المهنة': patient.job || '-',
        'جهة الاتصال': patient.contact || '-',
        'الملاحظات الطبية': patient.medical_notes || '-',
      }));
      
      // إنشاء ورقة عمل
      const worksheet = XLSX.utils.json_to_sheet(dataForExcel, { header: ['الاسم', 'تاريخ الميلاد', 'الهاتف', 'العنوان', 'المهنة', 'جهة الاتصال', 'الملاحظات الطبية'] });
      
      // تعديل اتجاه النص للغة العربية
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cell = worksheet[XLSX.utils.encode_cell({ r: R, c: C })];
          if (!cell) continue;
          cell.s = { alignment: { horizontal: 'right', vertical: 'center' } } as any;
        }
      }
      
      // إنشاء مصنف عمل
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'المرضى');
      
      // تحويل المصنف إلى ملف
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const fileData = new Blob([excelBuffer], { type: 'application/octet-stream' });
      
      // حفظ الملف
      saveAs(fileData, `قائمة_المرضى_${format(new Date(), 'dd-MM-yyyy')}.xlsx`);
      
      toast({
        title: "تم التصدير بنجاح",
        description: `تم تصدير ${allPatients.length} مريضًا إلى ملف إكسل`,
      });
    } catch (error) {
      console.error('Error exporting patients:', error);
      toast({
        title: "خطأ في التصدير",
        description: "حدث خطأ أثناء تصدير قائمة المرضى",
        variant: "destructive",
      });
    }
  };

  const importFromExcel = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportingFile(true);
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        // تخطي الصف الأول (العناوين)
        const rows = jsonData.slice(1) as any[][];
        const validPatients = [];
        
        for (const row of rows) {
          if (!row[0] || !row[1] || !row[2]) continue; // تأكد من وجود الاسم وتاريخ الميلاد والهاتف
          
          const patientData = {
            full_name: row[0]?.toString().trim() || '',
            date_of_birth: row[1] ? new Date(row[1]).toISOString().split('T')[0] : '',
            phone_number: row[2]?.toString().trim() || '',
            address: row[3]?.toString() === '-' ? '' : row[3]?.toString() || '',
            job: row[4]?.toString() === '-' ? '' : row[4]?.toString() || '',
            contact: row[5]?.toString() === '-' ? '' : row[5]?.toString() || '',
            medical_notes: row[6]?.toString() === '-' ? '' : row[6]?.toString() || '',
          };
          
          if (patientData.full_name && patientData.date_of_birth && patientData.phone_number) {
            validPatients.push(patientData);
          }
        }
        
        if (validPatients.length === 0) {
          toast({
            title: "خطأ في الاستيراد",
            description: "لا توجد بيانات صالحة في الملف",
            variant: "destructive",
          });
          setImportingFile(false);
          return;
        }
        
        // جلب جميع المرضى الموجودين للتحقق من التكرار
        const { data: existingPatients, error: fetchError } = await supabase
          .from("patients")
          .select("full_name, phone_number");
          
        if (fetchError) {
          throw fetchError;
        }
        
        // إنشاء مجموعة من المرضى الموجودين (الاسم + رقم الهاتف)
        const existingSet = new Set(
          (existingPatients || []).map(p => 
            `${p.full_name.toLowerCase().trim()}|${p.phone_number.trim()}`
          )
        );
        
        // تصفية المرضى الجدد فقط
        const newPatients = validPatients.filter(p => 
          !existingSet.has(`${p.full_name.toLowerCase().trim()}|${p.phone_number.trim()}`)
        );
        
        const skippedCount = validPatients.length - newPatients.length;
        
        if (newPatients.length === 0) {
          toast({
            title: "تنبيه",
            description: `تم تخطي ${skippedCount} مريض لأنهم موجودون مسبقاً (نفس الاسم ورقم الهاتف)`,
          });
          setImportingFile(false);
          return;
        }
        
        // إدراج المرضى الجدد فقط
        const { data: insertedData, error } = await supabase
          .from("patients")
          .insert(newPatients)
          .select();
          
        if (error) {
          toast({
            title: "خطأ في الاستيراد",
            description: "فشل في حفظ البيانات في قاعدة البيانات",
            variant: "destructive",
          });
        } else {
          queryClient.invalidateQueries({ queryKey: ["patients"] });
          const message = skippedCount > 0 
            ? `تم استيراد ${newPatients.length} مريض، وتم تخطي ${skippedCount} مريض مكرر`
            : `تم استيراد ${newPatients.length} مريض بنجاح`;
          toast({
            title: "نجح الاستيراد",
            description: message,
          });
        }
      } catch (error) {
        toast({
          title: "خطأ في قراءة الملف",
          description: "تأكد من أن الملف بتنسيق إكسل صحيح",
          variant: "destructive",
        });
      } finally {
        setImportingFile(false);
        event.target.value = ''; // إعادة تعيين قيمة المدخل
      }
    };
    
    reader.readAsArrayBuffer(file);
  };

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // جلب جميع المواعيد لتحديد المرضى بدون مواعيد
  const { data: appointments } = useQuery({
    queryKey: ["all-appointments-patient-ids"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("patient_id");
      if (error) throw error;
      return data;
    },
  });

  const { data: patients, isLoading, error } = useQuery({
    queryKey: ["patients", searchTerm],
    queryFn: async () => {
      // جلب جميع المرضى على دفعات لتجاوز حد 1000 صف
      const pageSize = 1000;
      let offset = 0;
      let allPatients: Patient[] = [];

      while (true) {
        let query = supabase.from("patients").select("*");
        
        if (searchTerm) {
          query = query.ilike("full_name", `%${searchTerm}%`);
        }
        
        const { data, error } = await query
          .order("full_name")
          .range(offset, offset + pageSize - 1);
        
        if (error) throw error;
        if (!data || data.length === 0) break;
        
        allPatients = allPatients.concat(data as Patient[]);
        if (data.length < pageSize) break;
        offset += pageSize;
      }

      return allPatients;
    },
    retry: 1,
    staleTime: 0,
  });

  // تصفية المرضى حسب الفلتر المحدد
  const filteredPatients = (() => {
    if (!patients) return [];
    
    if (filterMode === "duplicates") {
      // إيجاد المرضى المكررين (نفس الاسم)
      const nameCount = new Map<string, number>();
      patients.forEach(p => {
        const name = p.full_name.toLowerCase().trim();
        nameCount.set(name, (nameCount.get(name) || 0) + 1);
      });
      return patients.filter(p => 
        nameCount.get(p.full_name.toLowerCase().trim())! > 1
      );
    }
    
    if (filterMode === "no_appointments") {
      // المرضى الذين ليس لديهم مواعيد
      const patientIdsWithAppointments = new Set(
        (appointments || []).map(a => a.patient_id)
      );
      return patients.filter(p => !patientIdsWithAppointments.has(p.id));
    }
    
    return patients;
  })();

  if (error) {
    toast({
      title: "خطأ",
      description: "فشل في تحميل قائمة المرضى",
      variant: "destructive",
    });
  }

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

  // Pagination calculations
  const totalPatients = filteredPatients?.length || 0;
  const totalPages = Math.ceil(totalPatients / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedPatients = filteredPatients?.slice(startIndex, startIndex + itemsPerPage);

  // Reset page when search or filter changes
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleFilterChange = (mode: "all" | "duplicates" | "no_appointments") => {
    setFilterMode(mode);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-4 lg:space-y-6">
      

      
         
       

      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <CardTitle>  <div className="relative">
            <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="البحث عن المرضى بالاسم..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pr-10"
            />
          </div></CardTitle>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto flex-wrap">
            {/* فلاتر المرضى */}
            <div className="flex gap-1">
              <Button 
                variant={filterMode === "all" ? "default" : "outline"} 
                size="sm"
                onClick={() => handleFilterChange("all")}
              >
                الكل
              </Button>
              <Button 
                variant={filterMode === "duplicates" ? "default" : "outline"} 
                size="sm"
                onClick={() => handleFilterChange("duplicates")}
              >
                المكررين
              </Button>
              <Button 
                variant={filterMode === "no_appointments" ? "default" : "outline"} 
                size="sm"
                onClick={() => handleFilterChange("no_appointments")}
              >
                بدون مواعيد
              </Button>
            </div>
            <div className="relative">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={importFromExcel}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={importingFile}
              />
              <Button 
                variant="outline" 
                size="sm"
                disabled={importingFile}
                className="w-full sm:w-auto"
              >
                <Upload className="ml-2 h-4 w-4" />
                {importingFile ? "جاري الاستيراد..." : "استيراد "}
              </Button>
            </div>
            <Button 
              size="sm" 
              onClick={exportToExcel}
              disabled={!patients || patients.length === 0}
              className="w-full sm:w-auto bg-primary hover:bg-primary/90"
            >
              <FileDown className="ml-2 h-4 w-4" />
           تصدير
            </Button>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
       
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
          </div>
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
                      <TableHead className="text-right">الاسم</TableHead>
                      <TableHead className="text-right">تاريخ الميلاد</TableHead>
                      <TableHead className="text-right">الهاتف</TableHead>
                      <TableHead className="text-right">العنوان</TableHead>
                      <TableHead className="text-right">المهنة</TableHead>
                      <TableHead className="text-right">جهة الاتصال</TableHead>
                      <TableHead className="text-right">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedPatients?.map((patient) => {
                      const patientIdsWithAppointments = new Set((appointments || []).map(a => a.patient_id));
                      const hasNoAppointments = filterMode === "duplicates" && !patientIdsWithAppointments.has(patient.id);
                      return (
                      <TableRow 
                        key={patient.id}
                        className={`cursor-pointer hover:bg-muted/50 ${hasNoAppointments ? "bg-destructive/10 hover:bg-destructive/20" : ""}`}
                        onClick={() => viewPatientProfile(patient.id)}
                      >
                        <TableCell className="font-medium">{patient.full_name}</TableCell>
                        <TableCell>{formatDateSafe(patient.date_of_birth)}</TableCell>
                        <TableCell>{patient.phone_number}</TableCell>
                        <TableCell>{patient.address || "-"}</TableCell>
                        <TableCell>{patient.job || "-"}</TableCell>
                        <TableCell>{patient.contact || "-"}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
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
                    );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-4">
                {paginatedPatients?.map((patient) => {
                  const patientIdsWithAppointments = new Set((appointments || []).map(a => a.patient_id));
                  const hasNoAppointments = filterMode === "duplicates" && !patientIdsWithAppointments.has(patient.id);
                  return (
                  <Card 
                    key={patient.id} 
                    className={`p-4 cursor-pointer hover:bg-muted/50 ${hasNoAppointments ? "bg-destructive/10 hover:bg-destructive/20 border-destructive/30" : ""}`}
                    onClick={() => viewPatientProfile(patient.id)}
                  >
                    <div className="space-y-3">
                       <div className="flex justify-between items-start">
                         <h3 className="font-semibold text-lg">{patient.full_name}</h3>
                         <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
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
                          <span>{formatDateSafe(patient.date_of_birth)}</span>
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
                );
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    عرض {startIndex + 1} - {Math.min(startIndex + itemsPerPage, totalPatients)} من {totalPatients} مريض
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronRight className="h-4 w-4" />
                      السابق
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        return (
                          <Button
                            key={pageNum}
                            variant={currentPage === pageNum ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCurrentPage(pageNum)}
                            className="w-8 h-8 p-0"
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      التالي
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
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