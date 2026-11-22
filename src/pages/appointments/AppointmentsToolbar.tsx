import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Filter, X, Download, Upload, Columns3, CalendarX2 } from "lucide-react";
import * as XLSX from 'xlsx';
import { useQueryClient } from "@tanstack/react-query";
import { appointmentsApi, apiErrorMessage, type AppointmentStatus, type Doctor } from "@/api/clinic";
import { useToast } from "@/hooks/use-toast";

type ImportRow = { patient_name: string; doctor_name: string; scheduled_at: string; notes?: string | null; status?: AppointmentStatus };

const APPOINTMENT_STATUSES: AppointmentStatus[] = ["Scheduled", "Completed", "Cancelled"];

interface AppointmentsToolbarProps {
  filterDoctor: string;
  setFilterDoctor: Dispatch<SetStateAction<string>>;
  filterStartDate: string;
  setFilterStartDate: Dispatch<SetStateAction<string>>;
  filterEndDate: string;
  setFilterEndDate: Dispatch<SetStateAction<string>>;
  filterStatus: string;
  setFilterStatus: Dispatch<SetStateAction<string>>;
  filterPatientName: string;
  setFilterPatientName: Dispatch<SetStateAction<string>>;
  doctors: Doctor[] | undefined;
  setIsColumnSelectDialogOpen: Dispatch<SetStateAction<boolean>>;
  setIsExportColumnsDialogOpen: Dispatch<SetStateAction<boolean>>;
  setIsBulkDeleteDialogOpen: Dispatch<SetStateAction<boolean>>;
}

/** Header buttons: visible columns, filters popover, Excel export/import, bulk delete. */
export function AppointmentsToolbar({
  filterDoctor,
  setFilterDoctor,
  filterStartDate,
  setFilterStartDate,
  filterEndDate,
  setFilterEndDate,
  filterStatus,
  setFilterStatus,
  filterPatientName,
  setFilterPatientName,
  doctors,
  setIsColumnSelectDialogOpen,
  setIsExportColumnsDialogOpen,
  setIsBulkDeleteDialogOpen,
}: AppointmentsToolbarProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const clearFilters = () => {
    setFilterStartDate("");
    setFilterEndDate("");
    setFilterDoctor("");
    setFilterStatus("");
    setFilterPatientName("");
  };

  const filtersActive = Boolean(
    filterStartDate ||
    filterEndDate ||
    (filterDoctor && filterDoctor !== "all") ||
    (filterStatus && filterStatus !== "all") ||
    filterPatientName
  );

  const handleImportFromExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

        if (jsonData.length === 0) {
          toast({
            title: "خطأ",
            description: "الملف فارغ",
            variant: "destructive"
          });
          return;
        }

        // Build the rows; incomplete rows fail here, names are matched by the server
        const rows: ImportRow[] = [];
        const sheetRowNumbers: number[] = [];
        let localFailed = 0;

        jsonData.forEach((row, index) => {
          const patientName = String(row['اسم المريض'] ?? '').trim();
          const doctorName = String(row['الطبيب'] ?? '').trim();
          const dateStr = row['التاريخ'];
          const timeStr = row['الوقت'];
          if (!patientName || !doctorName || !dateStr || !timeStr) {
            localFailed++;
            return;
          }
          const scheduled = new Date(`${dateStr} ${timeStr}`);
          if (isNaN(scheduled.getTime())) {
            localFailed++;
            return;
          }
          const status = String(row['الحالة'] ?? '') as AppointmentStatus;
          rows.push({
            patient_name: patientName,
            doctor_name: doctorName,
            scheduled_at: scheduled.toISOString(),
            notes: row['ملاحظات'] ? String(row['ملاحظات']) : null,
            status: APPOINTMENT_STATUSES.includes(status) ? status : 'Scheduled',
          });
          sheetRowNumbers.push(index + 2); // + header row, 1-based
        });

        let created = 0;
        let failedReasons: string[] = [];
        let serverFailed = 0;
        if (rows.length > 0) {
          const res = await appointmentsApi.import(rows);
          created = res.created;
          serverFailed = res.failed.length;
          failedReasons = res.failed.slice(0, 5).map((f) => `صف ${sheetRowNumbers[f.row - 1] ?? f.row}: ${f.reason}`);
        }

        queryClient.invalidateQueries({ queryKey: ["appointments"] });

        toast({
          title: "اكتمل الاستيراد",
          description: `تم استيراد ${created} موعد بنجاح. فشل: ${serverFailed + localFailed}${failedReasons.length ? `\n${failedReasons.join('\n')}` : ''}`,
        });
      } catch (error) {
        toast({
          title: "خطأ",
          description: apiErrorMessage(error) || "فشل استيراد الملف",
          variant: "destructive"
        });
      }
    };

    reader.readAsArrayBuffer(file);
    e.target.value = ''; // Reset input
  };

  return (
    <div className="flex flex-wrap gap-2 lg:mr-auto">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsColumnSelectDialogOpen(true)}
        title="اختيار الأعمدة المرئية"
      >
        <Columns3 className="h-4 w-4 ml-2" />
        الأعمدة
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            title="إعدادات الفلاتر"
          >
            <Filter className="h-4 w-4 ml-2" />
            الفلاتر
            {filtersActive && <span className="mr-1 block h-2 w-2 rounded-full bg-destructive" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[min(20rem,calc(100vw-2rem))] p-4 space-y-4" dir="rtl">
          <div className="grid gap-2">
            <Label htmlFor="filter-start-date">التاريخ من</Label>
            <Input
              id="filter-start-date"
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              className="text-xs"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="filter-end-date">التاريخ إلى</Label>
            <Input
              id="filter-end-date"
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              className="text-xs"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="filter-patient">المريض</Label>
            <Input
              id="filter-patient"
              type="text"
              value={filterPatientName}
              onChange={(e) => setFilterPatientName(e.target.value)}
              placeholder="ابحث عن مريض..."
              className="text-xs"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="filter-doctor">الطبيب</Label>
            <Select value={filterDoctor} onValueChange={setFilterDoctor}>
              <SelectTrigger id="filter-doctor" className="text-xs">
                <SelectValue placeholder="جميع الأطباء" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الأطباء</SelectItem>
                {doctors?.map((doctor) => (
                  <SelectItem key={doctor.id} value={doctor.id}>
                    {doctor.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="filter-status">الحالة</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger id="filter-status" className="text-xs">
                <SelectValue placeholder="جميع الحالات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الحالات</SelectItem>
                <SelectItem value="Scheduled">مجدول</SelectItem>
                <SelectItem value="Completed">مكتمل</SelectItem>
                <SelectItem value="Cancelled">ملغي</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              disabled={!filtersActive}
            >
              <X className="h-3 w-3 ml-1" />
              مسح جميع الفلاتر
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <Button
        size="sm"
        onClick={() => setIsExportColumnsDialogOpen(true)}
        title="تصدير إلى Excel"
        className="bg-primary hover:bg-primary/90"
      >
        <Download className="h-4 w-4 ml-2" />
        تصدير
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => document.getElementById('excel-import')?.click()}
        title="استيراد من Excel"
      >
        <Upload className="h-4 w-4 ml-2" />
        استيراد
      </Button>
      <input
        id="excel-import"
        type="file"
        accept=".xlsx,.xls"
        onChange={handleImportFromExcel}
        className="hidden"
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsBulkDeleteDialogOpen(true)}
        title="حذف مواعيد بين تاريخين"
        className="text-destructive hover:text-destructive hover:bg-destructive/10"
      >
        <CalendarX2 className="h-4 w-4 ml-2" />
        حذف جماعي
      </Button>
    </div>
  );
}
