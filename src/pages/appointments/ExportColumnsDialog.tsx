import { useState, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Download } from "lucide-react";
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { appointmentsApi, apiErrorMessage, type Appointment, type AppointmentFilters } from "@/api/clinic";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface ExportColumnsDialogProps {
  isExportColumnsDialogOpen: boolean;
  setIsExportColumnsDialogOpen: Dispatch<SetStateAction<boolean>>;
  appointmentFilters: AppointmentFilters;
  specialtyName: (apt: Appointment) => string;
}

/** Excel export: choose the columns, then export every appointment matching the filters. */
export function ExportColumnsDialog({
  isExportColumnsDialogOpen,
  setIsExportColumnsDialogOpen,
  appointmentFilters,
  specialtyName,
}: ExportColumnsDialogProps) {
  const availableColumns = [
    { id: 'patient_name', label: 'اسم المريض' },
    { id: 'phone_number', label: 'رقم الهاتف' },
    { id: 'doctor_name', label: 'الطبيب' },
    { id: 'specialty', label: 'التخصص' },
    { id: 'date', label: 'التاريخ' },
    { id: 'time', label: 'الوقت' },
    { id: 'status', label: 'الحالة' },
    { id: 'notes', label: 'ملاحظات' }
  ];

  const [selectedColumns, setSelectedColumns] = useState<string[]>(
    availableColumns.map(col => col.id)
  );

  const { toast } = useToast();

  const handleExportToExcel = async () => {
    // Export every appointment matching the filters, not just the visible page
    let allAppointments: Appointment[] = [];
    try {
      const res = await appointmentsApi.list({ ...appointmentFilters, per_page: 5000 });
      allAppointments = res.data;
    } catch (e) {
      toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" });
      return;
    }

    if (allAppointments.length === 0) {
      toast({
        title: "لا توجد بيانات",
        description: "لا توجد مواعيد لتصديرها",
        variant: "destructive"
      });
      return;
    }

    if (selectedColumns.length === 0) {
      toast({
        title: "لا توجد أعمدة محددة",
        description: "يرجى اختيار عمود واحد على الأقل للتصدير",
        variant: "destructive"
      });
      return;
    }

    // Group appointments by date
    const appointmentsByDate: { [key: string]: Appointment[] } = {};

    allAppointments.forEach(apt => {
      const date = format(new Date(apt.scheduled_at), 'dd/MM/yyyy');
      if (!appointmentsByDate[date]) {
        appointmentsByDate[date] = [];
      }
      appointmentsByDate[date].push(apt);
    });

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Create a sheet for each date
    Object.keys(appointmentsByDate).sort((a, b) => {
      const dateA = new Date(appointmentsByDate[a][0].scheduled_at);
      const dateB = new Date(appointmentsByDate[b][0].scheduled_at);
      return dateB.getTime() - dateA.getTime();
    }).forEach(date => {
      const dayAppointments = appointmentsByDate[date];

      const exportData = dayAppointments.map(apt => {
        const row: Record<string, string> = {};

        if (selectedColumns.includes('patient_name')) {
          row['اسم المريض'] = apt.patient?.full_name || '';
        }
        if (selectedColumns.includes('phone_number')) {
          row['رقم الهاتف'] = apt.patient?.phone_number || '';
        }
        if (selectedColumns.includes('doctor_name')) {
          row['الطبيب'] = apt.doctor?.full_name || '';
        }
        if (selectedColumns.includes('specialty')) {
          row['التخصص'] = specialtyName(apt);
        }
        if (selectedColumns.includes('date')) {
          row['التاريخ'] = format(new Date(apt.scheduled_at), 'dd/MM/yyyy');
        }
        if (selectedColumns.includes('time')) {
          row['الوقت'] = new Date(apt.scheduled_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        }
        if (selectedColumns.includes('status')) {
          row['الحالة'] = apt.status;
        }
        if (selectedColumns.includes('notes')) {
          row['ملاحظات'] = apt.notes || '';
        }

        return row;
      });

      const ws = XLSX.utils.json_to_sheet(exportData);

      // Create a safe sheet name (max 31 chars, no special chars)
      const sheetName = date.substring(0, 31).replace(/[:\\/?*[\]]/g, '-');
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(data, `appointments_${new Date().toISOString().split('T')[0]}.xlsx`);

    toast({
      title: "نجح",
      description: `تم تصدير ${Object.keys(appointmentsByDate).length} يوم من المواعيد إلى Excel بنجاح`
    });

    setIsExportColumnsDialogOpen(false);
  };

  return (
    <Dialog open={isExportColumnsDialogOpen} onOpenChange={setIsExportColumnsDialogOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>اختر الأعمدة للتصدير</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-3">
            {availableColumns.map((column) => (
              <div key={column.id} className="flex items-center space-x-2 space-x-reverse">
                <Checkbox
                  id={column.id}
                  checked={selectedColumns.includes(column.id)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedColumns([...selectedColumns, column.id]);
                    } else {
                      setSelectedColumns(selectedColumns.filter(id => id !== column.id));
                    }
                  }}
                />
                <Label
                  htmlFor={column.id}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  {column.label}
                </Label>
              </div>
            ))}
          </div>

          <div className="flex justify-between gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                if (selectedColumns.length === availableColumns.length) {
                  setSelectedColumns([]);
                } else {
                  setSelectedColumns(availableColumns.map(col => col.id));
                }
              }}
            >
              {selectedColumns.length === availableColumns.length ? 'إلغاء الكل' : 'تحديد الكل'}
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setIsExportColumnsDialogOpen(false)}
              >
                إلغاء
              </Button>
              <Button
                onClick={handleExportToExcel}
                disabled={selectedColumns.length === 0}
              >
                <Download className="h-4 w-4 ml-2" />
                تصدير
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
