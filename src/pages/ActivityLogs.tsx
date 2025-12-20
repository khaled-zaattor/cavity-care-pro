import { useState, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface ActivityLog {
  id: string;
  user_name: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: any;
  created_at: string;
}

interface Patient {
  id: string;
  full_name: string;
}

export default function ActivityLogs() {
  const [userRole, setUserRole] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    checkUserRole();
  }, []);

  const checkUserRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();

      setUserRole(roleData?.role || null);
    } catch (error) {
      console.error('Error checking user role:', error);
    }
  };

  const { data: logs, isLoading } = useQuery({
    queryKey: ["activity-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_logs")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as ActivityLog[];
    },
  });

  const { data: patients } = useQuery({
    queryKey: ["patients-for-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("id, full_name");

      if (error) throw error;
      return data as Patient[];
    },
  });

  const patientsMap = new Map(patients?.map(p => [p.id, p.full_name]) || []);

  const getPatientName = (log: ActivityLog): string => {
    // Try to get patient_id from details.new_data or details.old_data
    const patientId = log.details?.new_data?.patient_id 
      || log.details?.old_data?.patient_id
      || (log.entity_type === 'patients' ? log.entity_id : null);
    
    if (patientId && patientsMap.has(patientId)) {
      return patientsMap.get(patientId) || "-";
    }
    return "-";
  };

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("activity_logs")
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-logs"] });
      toast.success("تم تصفير السجل بنجاح");
    },
    onError: (error) => {
      console.error("Error deleting logs:", error);
      toast.error("حدث خطأ أثناء حذف السجلات");
    },
  });

  const exportLogsToExcel = () => {
    if (!logs || logs.length === 0) {
      return false;
    }

    const exportData = logs.map((log) => ({
      "المستخدم": log.user_name,
      "اسم المريض": getPatientName(log),
      "الإجراء": log.action,
      "النوع": log.entity_type || "-",
      "التفاصيل": log.details ? JSON.stringify(log.details) : "-",
      "التاريخ والوقت": format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", {
        locale: ar,
      }),
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "سجل النشاطات");

    const fileName = `activity_logs_${format(new Date(), "yyyy-MM-dd")}.xlsx`;
    XLSX.writeFile(wb, fileName);

    return true;
  };

  const handleExport = () => {
    if (!logs || logs.length === 0) {
      toast.error("لا توجد سجلات للتصدير");
      return;
    }

    if (exportLogsToExcel()) {
      toast.success("تم تصدير السجل بنجاح");
    }
  };

  const handleResetLogs = () => {
    if (!logs || logs.length === 0) {
      toast.error("لا توجد سجلات للتصفير");
      return;
    }

    // Export first
    const exported = exportLogsToExcel();
    if (exported) {
      // Then delete
      deleteMutation.mutate();
    } else {
      toast.error("فشل تصدير السجلات");
    }
  };

  if (isLoading || userRole === null) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">جاري التحميل...</p>
      </div>
    );
  }

  if (userRole !== 'super_admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
              <Shield className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle className="text-2xl">غير مصرح</CardTitle>
            <CardDescription>
              هذه الصفحة مخصصة للمديرين العامين فقط
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">سجل النشاطات</h1>
        <div className="flex gap-2">
          <Button onClick={handleExport} className="gap-2">
            <Download className="h-4 w-4" />
            تصدير إلى Excel
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="gap-2">
                <Trash2 className="h-4 w-4" />
                تصفير السجل
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>تأكيد تصفير السجل</AlertDialogTitle>
                <AlertDialogDescription>
                  سيتم تصدير جميع السجلات إلى ملف Excel ثم حذفها نهائياً من قاعدة البيانات. هل أنت متأكد؟
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleResetLogs}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  تصفير السجل
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">المستخدم</TableHead>
                <TableHead className="text-right">اسم المريض</TableHead>
                <TableHead className="text-right">الإجراء</TableHead>
                <TableHead className="text-right">النوع</TableHead>
                <TableHead className="text-right">التفاصيل</TableHead>
                <TableHead className="text-right">التاريخ والوقت</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs && logs.length > 0 ? (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">{log.user_name}</TableCell>
                    <TableCell>{getPatientName(log)}</TableCell>
                    <TableCell>{log.action}</TableCell>
                    <TableCell>{log.entity_type || "-"}</TableCell>
                    <TableCell className="max-w-xs truncate">
                      {log.details ? JSON.stringify(log.details) : "-"}
                    </TableCell>
                    <TableCell>
                      {format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", {
                        locale: ar,
                      })}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    لا توجد سجلات
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
