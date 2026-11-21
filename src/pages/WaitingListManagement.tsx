import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { appointmentsApi, doctorsApi, patientsApi, waitingListApi, apiErrorMessage, type PatientLite, type WaitingEntry } from "@/api/clinic";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { UserPlus, UserCheck, UserX, Clock, Check, ChevronsUpDown, Edit, FileSpreadsheet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// "auto" = use the doctor of the patient's appointment today (if any)
const AUTO_DOCTOR = "auto";

type Patient = PatientLite;
type WaitingPatient = WaitingEntry;

export default function WaitingListManagement() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [showOnlyTodayAppointments, setShowOnlyTodayAppointments] = useState(false);
  const [editingPatient, setEditingPatient] = useState<WaitingPatient | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editArrivalTime, setEditArrivalTime] = useState("");
  const [editExamTime, setEditExamTime] = useState("");
  const [waitingDoctor, setWaitingDoctor] = useState<string>(AUTO_DOCTOR);

  const { data: doctors = [] } = useQuery({
    queryKey: ["doctors"],
    queryFn: () => doctorsApi.list(),
  });

  // لا يوجد realtime: تحديث لائحة الانتظار كل 5 ثوانٍ، وبعد كل عملية مباشرة
  const { data: waitingData, refetch: refetchWaitingList } = useQuery({
    queryKey: ["waiting-list"],
    queryFn: () => waitingListApi.list(),
    refetchInterval: 5000,
  });
  const waitingList: WaitingPatient[] = waitingData?.data ?? [];

  const { data: todayAppointments = [] } = useQuery({
    queryKey: ["appointments", "today"],
    queryFn: () => appointmentsApi.today(),
  });

  // مرضى مواعيد اليوم (بدون تكرار، مرتبين بالاسم)
  const todayAppointmentPatients: Patient[] = Array.from(
    new Map(
      todayAppointments
        .filter((a) => a.patient)
        .map((a) => [a.patient_id, a.patient as Patient] as const),
    ).values(),
  ).sort((a, b) => a.full_name.localeCompare(b.full_name, "ar"));

  useEffect(() => {
    // القائمة الافتراضية قبل البحث (أول 200 مريض بالاسم)
    patientsApi
      .search("")
      .then(setPatients)
      .catch((error) => console.error('Error fetching patients:', error));
  }, []);

  // Server-side search across ALL patients
  useEffect(() => {
    const q = searchQuery.trim();
    if (!open) return; // only search when combobox is open
    if (!q) {
      setSearchResults([]);
      return;
    }

    const handler = setTimeout(async () => {
      try {
        setSearchResults(await patientsApi.search(q));
      } catch (error) {
        console.error('Error searching patients:', error);
      }
    }, 250);

    return () => clearTimeout(handler);
  }, [searchQuery, open]);

  const addPatientToWaitingList = async (patientId: string) => {
    if (!patientId) {
      toast.error("الرجاء اختيار مريض");
      return;
    }

    // الخادم يربط أول موعد اليوم ويختار طبيبه عند "تلقائي"
    try {
      await waitingListApi.add(patientId, waitingDoctor !== AUTO_DOCTOR ? waitingDoctor : null);
    } catch (error) {
      toast.error(apiErrorMessage(error));
      console.error('Error adding patient:', error);
      return;
    }

    refetchWaitingList();
    toast.success("تم إضافة المريض إلى لائحة الانتظار");
    setSelectedPatient("");
    setSearchQuery("");
    setOpen(false);
  };

  const moveToExamination = async (id: string) => {
    try {
      await waitingListApi.enterExam(id);
    } catch (error) {
      toast.error(apiErrorMessage(error));
      console.error('Error updating status:', error);
      return;
    }

    refetchWaitingList();
    toast.success("تم نقل المريض إلى غرفة الفحص");
  };

  const completeVisit = async (id: string) => {
    try {
      await waitingListApi.complete(id);
    } catch (error) {
      toast.error(apiErrorMessage(error));
      console.error('Error completing visit:', error);
      return;
    }

    refetchWaitingList();
    toast.success("تم إنهاء الزيارة");
  };

  const completeAllInExamination = async () => {
    const patientsInExam = activeWaitingList.filter(p => p.status === 'in_examination');
    
    if (patientsInExam.length === 0) {
      toast.info("لا يوجد مرضى في الفحص حالياً");
      return;
    }

    try {
      await waitingListApi.completeAllInExam();
    } catch (error) {
      toast.error(apiErrorMessage(error));
      console.error('Error completing visits:', error);
      return;
    }

    refetchWaitingList();
    toast.success(`تم إنهاء زيارة ${patientsInExam.length} مريض`);
  };

  const removeFromWaitingList = async (id: string) => {
    try {
      await waitingListApi.remove(id);
    } catch (error) {
      toast.error(apiErrorMessage(error));
      console.error('Error removing patient:', error);
      return;
    }

    refetchWaitingList();
    toast.success("تم إزالة المريض من لائحة الانتظار");
  };

  const openEditDialog = (patient: WaitingPatient) => {
    setEditingPatient(patient);
    setEditArrivalTime(format(new Date(patient.clinic_arrival_time), "yyyy-MM-dd'T'HH:mm"));
    setEditExamTime(patient.examination_room_entry_time 
      ? format(new Date(patient.examination_room_entry_time), "yyyy-MM-dd'T'HH:mm")
      : "");
    setEditDialogOpen(true);
  };

  const saveEditedTimes = async () => {
    if (!editingPatient || !editArrivalTime) {
      toast.error("الرجاء إدخال وقت الوصول");
      return;
    }

    try {
      await waitingListApi.editTimes(
        editingPatient.id,
        new Date(editArrivalTime).toISOString(),
        editExamTime ? new Date(editExamTime).toISOString() : null,
      );
    } catch (error) {
      toast.error(apiErrorMessage(error));
      console.error('Error updating times:', error);
      return;
    }

    refetchWaitingList();
    toast.success("تم تحديث الأوقات بنجاح");
    setEditDialogOpen(false);
    setEditingPatient(null);
  };

  const exportToExcelAndDelete = async () => {
    if (completedList.length === 0) {
      toast.info("لا توجد زيارات منتهية للتصدير");
      return;
    }

    // Prepare data for Excel
    const excelData = completedList.map(patient => ({
      'اسم المريض': patient.patient?.full_name ?? '',
      'وقت الوصول': format(new Date(patient.clinic_arrival_time), "dd/MM/yyyy HH:mm", { locale: ar }),
      'وقت الدخول للفحص': patient.examination_room_entry_time 
        ? format(new Date(patient.examination_room_entry_time), "dd/MM/yyyy HH:mm", { locale: ar })
        : 'لم يدخل للفحص'
    }));

    // Create worksheet and workbook
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'الزيارات');

    // Generate Excel file
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    // Save file with today's date
    const fileName = `زيارات-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
    saveAs(data, fileName);

    // Delete completed records (server: super admin only)
    try {
      // Only the rows that went into the Excel file.
      await waitingListApi.clearCompleted(completedList.map((p) => p.id));
    } catch (error) {
      toast.error(apiErrorMessage(error));
      console.error('Error deleting records:', error);
      return;
    }

    refetchWaitingList();
    toast.success(`تم تصدير وحذف ${completedList.length} زيارة منتهية`);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'waiting':
        return <Badge variant="default">في الانتظار</Badge>;
      case 'in_examination':
        return <Badge variant="secondary">في الفحص</Badge>;
      case 'completed':
        return <Badge variant="outline">منتهي</Badge>;
      default:
        return null;
    }
  };

  const activeWaitingList = waitingList.filter(p => p.status !== 'completed');
  const completedList = waitingList.filter(p => p.status === 'completed');

  // Filter patients based on search and today's appointments filter
  let displayPatients = searchQuery.trim() ? searchResults : patients;
  
  // When filter is active and no search query, show only today's appointment patients
  if (showOnlyTodayAppointments && !searchQuery.trim()) {
    displayPatients = todayAppointmentPatients;
  } else if (showOnlyTodayAppointments && searchQuery.trim()) {
    // When both filter and search are active, filter search results
    const todayAppointmentPatientIds = todayAppointments.map(apt => apt.patient_id);
    displayPatients = searchResults.filter(patient => 
      todayAppointmentPatientIds.includes(patient.id)
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6" dir="rtl">
      <h1 className="text-3xl font-bold">إدارة لائحة الانتظار</h1>

      <Card>
        <CardHeader>
          <CardTitle>إضافة مريض إلى لائحة الانتظار</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 max-w-sm">
            <Label>الطبيب</Label>
            <Select value={waitingDoctor} onValueChange={setWaitingDoctor}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTO_DOCTOR}>تلقائي (حسب موعد اليوم)</SelectItem>
                {doctors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    د. {d.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <Switch
              id="today-appointments"
              checked={showOnlyTodayAppointments}
              onCheckedChange={setShowOnlyTodayAppointments}
            />
            <Label htmlFor="today-appointments" className="cursor-pointer">
              إظهار المرضى الذين لديهم مواعيد اليوم فقط ({todayAppointments.length})
            </Label>
          </div>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between"
              >
                ابحث عن مريض وأضفه إلى لائحة الانتظار...
                <ChevronsUpDown className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[500px] p-0 bg-background z-50">
              <Command shouldFilter={false}>
                <CommandInput 
                  placeholder="ابحث عن مريض بالاسم أو رقم الهاتف..." 
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                />
                <CommandList className="max-h-[400px]">
                  <CommandEmpty>لم يتم العثور على مرضى</CommandEmpty>
                  <CommandGroup>
                    {displayPatients.map((patient) => {
                      const appointment = todayAppointments.find(apt => apt.patient_id === patient.id);
                      return (
                        <CommandItem
                          key={patient.id}
                          value={patient.id}
                          onSelect={() => addPatientToWaitingList(patient.id)}
                          className="cursor-pointer"
                        >
                          <UserPlus className="ml-2 h-4 w-4" />
                          <div className="flex-1">
                            <div>{patient.full_name} - {patient.phone_number}</div>
                            {appointment && (
                              <div className="text-xs text-muted-foreground">
                                موعد اليوم: {format(new Date(appointment.scheduled_at), "p", { locale: ar })}
                              </div>
                            )}
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>المرضى الحاليون</CardTitle>
          {activeWaitingList.filter(p => p.status === 'in_examination').length > 0 && (
            <Button 
              variant="secondary" 
              size="sm"
              onClick={completeAllInExamination}
            >
              <Clock className="ml-2 h-4 w-4" />
              إنهاء زيارة الجميع ({activeWaitingList.filter(p => p.status === 'in_examination').length})
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {activeWaitingList.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                لا يوجد مرضى في الانتظار
              </p>
            ) : (
              activeWaitingList.map((patient) => (
                <div
                  key={patient.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-lg">
                        {patient.patient?.full_name}
                      </h3>
                      {getStatusBadge(patient.status)}
                      {patient.doctor && (
                        <Badge variant="outline">د. {patient.doctor.full_name}</Badge>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 text-sm text-muted-foreground">
                      <div>
                        <p className="font-medium">وقت الموعد</p>
                        <p>
                          {patient.appointment
                            ? format(new Date(patient.appointment.scheduled_at), "p", { locale: ar })
                            : "غير محدد"}
                        </p>
                      </div>
                      
                      <div>
                        <p className="font-medium">وقت الوصول</p>
                        <p>{format(new Date(patient.clinic_arrival_time), "p", { locale: ar })}</p>
                      </div>
                      
                      {patient.examination_room_entry_time && (
                        <div>
                          <p className="font-medium">وقت الدخول للفحص</p>
                          <p>
                            {format(new Date(patient.examination_room_entry_time), "p", { locale: ar })}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {patient.status === 'waiting' && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => moveToExamination(patient.id)}
                      >
                        <UserCheck className="ml-2 h-4 w-4" />
                        نقل للفحص
                      </Button>
                    )}
                    
                    {patient.status === 'in_examination' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => completeVisit(patient.id)}
                      >
                        <Clock className="ml-2 h-4 w-4" />
                        إنهاء الزيارة
                      </Button>
                    )}
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditDialog(patient)}
                    >
                      <Edit className="ml-2 h-4 w-4" />
                      تعديل
                    </Button>
                    
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => removeFromWaitingList(patient.id)}
                    >
                      <UserX className="ml-2 h-4 w-4" />
                      إزالة
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {completedList.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>الزيارات المنتهية اليوم</CardTitle>
            <Button 
              size="sm"
              onClick={exportToExcelAndDelete}
              className="bg-primary hover:bg-primary/90"
            >
              <FileSpreadsheet className="ml-2 h-4 w-4" />
              تصدير وحذف ({completedList.length})
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {completedList.map((patient) => (
                <div
                  key={patient.id}
                  className="flex items-center justify-between p-3 border rounded-lg bg-muted/50"
                >
                  <div>
                    <p className="font-medium">{patient.patient?.full_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(patient.clinic_arrival_time), "p", { locale: ar })} - 
                      {patient.examination_room_entry_time && 
                        ` ${format(new Date(patient.examination_room_entry_time), "p", { locale: ar })}`}
                    </p>
                  </div>
                  {getStatusBadge(patient.status)}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل أوقات المريض</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="arrival-time">وقت الوصول للعيادة</Label>
              <Input
                id="arrival-time"
                type="datetime-local"
                value={editArrivalTime}
                onChange={(e) => setEditArrivalTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exam-time">وقت الدخول لغرفة الفحص (اختياري)</Label>
              <Input
                id="exam-time"
                type="datetime-local"
                value={editExamTime}
                onChange={(e) => setEditExamTime(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={saveEditedTimes}>
              حفظ التعديلات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
