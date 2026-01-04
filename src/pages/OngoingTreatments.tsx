import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Filter, X, MoreHorizontal, CheckCircle, Trash2, Pencil, Download } from "lucide-react";
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { format } from "date-fns";

export default function OngoingTreatments() {
  const [isEditCostDialogOpen, setIsEditCostDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isCompleteDialogOpen, setIsCompleteDialogOpen] = useState(false);
  const [selectedTreatment, setSelectedTreatment] = useState<any>(null);
  const [editCostSyp, setEditCostSyp] = useState("");
  const [editCostUsd, setEditCostUsd] = useState("");
  
  // Filter states
  const [filterPatientName, setFilterPatientName] = useState("");
  const [filterDoctor, setFilterDoctor] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [debouncedPatientName, setDebouncedPatientName] = useState("");

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // Debounce patient name filter
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPatientName(filterPatientName);
    }, 500);
    return () => clearTimeout(timer);
  }, [filterPatientName]);

  const clearFilters = () => {
    setFilterPatientName("");
    setFilterDoctor("");
    setFilterStatus("all");
    setFilterStartDate("");
    setFilterEndDate("");
  };

  const filtersActive = Boolean(
    filterPatientName ||
    (filterDoctor && filterDoctor !== "all") ||
    (filterStatus && filterStatus !== "all") ||
    filterStartDate ||
    filterEndDate
  );

  // Fetch treatment records with all related data and executed steps
  const { data: treatmentRecords, isLoading } = useQuery({
    queryKey: ["ongoing-treatments", filterDoctor, filterStatus, filterStartDate, filterEndDate, debouncedPatientName],
    queryFn: async () => {
      let query = supabase
        .from("treatment_records")
        .select(`
          *,
          treatments (name),
          sub_treatments (name),
          appointments!inner (
            id,
            scheduled_at,
            notes,
            patient_id,
            doctor_id,
            patients (id, full_name, phone_number),
            doctors (id, full_name, specialty)
          )
        `)
        .order("performed_at", { ascending: false });

      // Apply date range filter
      if (filterStartDate && filterEndDate) {
        const startOfDay = new Date(filterStartDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(filterEndDate);
        endOfDay.setHours(23, 59, 59, 999);
        query = query
          .gte("performed_at", startOfDay.toISOString())
          .lte("performed_at", endOfDay.toISOString());
      } else if (filterStartDate) {
        const startOfDay = new Date(filterStartDate);
        startOfDay.setHours(0, 0, 0, 0);
        query = query.gte("performed_at", startOfDay.toISOString());
      } else if (filterEndDate) {
        const endOfDay = new Date(filterEndDate);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte("performed_at", endOfDay.toISOString());
      }

      // Apply status filter
      if (filterStatus && filterStatus !== "all") {
        query = query.eq("is_completed", filterStatus === "completed");
      }

      const { data, error } = await query;
      if (error) throw error;

      let filteredData = data || [];

      // Apply doctor filter (client-side since it's in joined data)
      if (filterDoctor && filterDoctor !== "all") {
        filteredData = filteredData.filter(
          (record) => record.appointments?.doctor_id === filterDoctor
        );
      }

      // Apply patient name filter (client-side)
      if (debouncedPatientName) {
        filteredData = filteredData.filter((record) =>
          record.appointments?.patients?.full_name
            ?.toLowerCase()
            .includes(debouncedPatientName.toLowerCase())
        );
      }

      // For each treatment record, fetch the executed steps for this specific sub_treatment
      // Same logic as PatientProfile page
      const recordsWithSteps = await Promise.all(
        filteredData.map(async (record) => {
          const { data: steps, error: stepsError } = await supabase
            .from("appointment_treatment_steps")
            .select(`
              *,
              sub_treatment_step_id,
              sub_treatment_steps!inner (
                step_name,
                sub_treatment_id
              )
            `)
            .eq("appointment_id", record.appointments.id)
            .eq("sub_treatment_steps.sub_treatment_id", record.sub_treatment_id);

          if (stepsError) {
            console.error("Error fetching steps:", stepsError);
            return { ...record, executed_steps: [] };
          }

          return { ...record, executed_steps: steps || [] };
        })
      );

      return recordsWithSteps;
    },
  });

  // Fetch doctors for filter
  const { data: doctors } = useQuery({
    queryKey: ["doctors"],
    queryFn: async () => {
      const { data, error } = await supabase.from("doctors").select("id, full_name");
      if (error) throw error;
      return data;
    },
  });

  // Update cost mutation
  const updateCostMutation = useMutation({
    mutationFn: async ({ id, actual_cost_syp, actual_cost_usd }: { id: string; actual_cost_syp: number; actual_cost_usd: number }) => {
      const { error } = await supabase
        .from("treatment_records")
        .update({ actual_cost_syp, actual_cost_usd })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ongoing-treatments"] });
      setIsEditCostDialogOpen(false);
      setSelectedTreatment(null);
      toast({ title: "نجاح", description: "تم تحديث التكلفة بنجاح" });
    },
    onError: () => {
      toast({ title: "خطأ", description: "فشل في تحديث التكلفة", variant: "destructive" });
    },
  });

  // Mark as complete mutation
  const markCompleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("treatment_records")
        .update({ is_completed: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ongoing-treatments"] });
      setIsCompleteDialogOpen(false);
      setSelectedTreatment(null);
      toast({ title: "نجاح", description: "تم تمييز العلاج كمكتمل" });
    },
    onError: () => {
      toast({ title: "خطأ", description: "فشل في تحديث الحالة", variant: "destructive" });
    },
  });

  // Delete treatment record mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("treatment_records")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ongoing-treatments"] });
      setIsDeleteDialogOpen(false);
      setSelectedTreatment(null);
      toast({ title: "نجاح", description: "تم حذف سجل العلاج" });
    },
    onError: () => {
      toast({ title: "خطأ", description: "فشل في حذف السجل", variant: "destructive" });
    },
  });

  const handleEditCost = (treatment: any) => {
    setSelectedTreatment(treatment);
    setEditCostSyp(treatment.actual_cost_syp?.toString() || "");
    setEditCostUsd(treatment.actual_cost_usd?.toString() || "");
    setIsEditCostDialogOpen(true);
  };

  const handleMarkComplete = (treatment: any) => {
    setSelectedTreatment(treatment);
    setIsCompleteDialogOpen(true);
  };

  const handleDelete = (treatment: any) => {
    setSelectedTreatment(treatment);
    setIsDeleteDialogOpen(true);
  };

  const getCompletedStepsForTreatment = (record: any) => {
    const steps = record.executed_steps || [];
    return steps.map((s: any) => s.sub_treatment_steps?.step_name).filter(Boolean).join("، ");
  };

  const exportToExcel = () => {
    if (!treatmentRecords || treatmentRecords.length === 0) {
      toast({ title: "تنبيه", description: "لا توجد بيانات للتصدير" });
      return;
    }

    const exportData = treatmentRecords.map((record) => ({
      "التاريخ": format(new Date(record.performed_at), "dd/MM/yyyy"),
      "اسم المريض": record.appointments?.patients?.full_name || "",
      "رقم السن": record.tooth_number || "",
      "العلاج": record.treatments?.name || "",
      "العلاج الفرعي": record.sub_treatments?.name || "",
      "الخطوات المنفذة": getCompletedStepsForTreatment(record),
      "التكلفة بالليرة": record.actual_cost_syp || 0,
      "التكلفة بالدولار": record.actual_cost_usd || 0,
      "الحالة": record.is_completed ? "مكتمل" : "جاري",
      "الطبيب": record.appointments?.doctors?.full_name || "",
      "ملاحظات العلاج": record.treatment_notes || "",
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "العلاجات الجارية");
    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], { type: "application/octet-stream" });
    saveAs(blob, `العلاجات_الجارية_${format(new Date(), "dd-MM-yyyy")}.xlsx`);
  };

  return (
    <div className="container mx-auto py-6 px-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <CardTitle className="text-xl md:text-2xl">العلاجات الجارية</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportToExcel}>
                <Download className="h-4 w-4 ml-2" />
                تصدير Excel
              </Button>
              {filtersActive && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 ml-1" />
                  مسح الفلاتر
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
            <div>
              <Label className="text-sm mb-1 block">اسم المريض</Label>
              <Input
                placeholder="بحث باسم المريض..."
                value={filterPatientName}
                onChange={(e) => setFilterPatientName(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-sm mb-1 block">الطبيب</Label>
              <Select value={filterDoctor} onValueChange={setFilterDoctor}>
                <SelectTrigger>
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
            <div>
              <Label className="text-sm mb-1 block">الحالة</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="جميع الحالات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحالات</SelectItem>
                  <SelectItem value="ongoing">جاري</SelectItem>
                  <SelectItem value="completed">مكتمل</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm mb-1 block">من تاريخ</Label>
              <Input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-sm mb-1 block">إلى تاريخ</Label>
              <Input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
              />
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
          ) : treatmentRecords?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">لا توجد سجلات علاج</div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>التاريخ</TableHead>
                      <TableHead>المريض</TableHead>
                      <TableHead>رقم السن</TableHead>
                      <TableHead>العلاج</TableHead>
                      <TableHead>الخطوات المنفذة</TableHead>
                      <TableHead>التكلفة</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead>الطبيب</TableHead>
                      <TableHead>ملاحظات العلاج</TableHead>
                      <TableHead>الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {treatmentRecords?.map((record) => (
                      <TableRow
                        key={record.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/patient-profile/${record.appointments?.patients?.id}`)}
                      >
                        <TableCell>
                          {format(new Date(record.performed_at), "dd/MM/yyyy")}
                        </TableCell>
                        <TableCell className="font-medium">
                          {record.appointments?.patients?.full_name}
                        </TableCell>
                        <TableCell>{record.tooth_number}</TableCell>
                        <TableCell>
                          {record.sub_treatments?.name}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {getCompletedStepsForTreatment(record) || "-"}
                        </TableCell>
                        <TableCell>{record.actual_cost_syp ? `${record.actual_cost_syp.toLocaleString('en-US')} ل.س` : "-"} {record.actual_cost_usd ? `/ $${record.actual_cost_usd}` : ""}</TableCell>
                        <TableCell>
                          <Badge variant={record.is_completed ? "default" : "secondary"}>
                            {record.is_completed ? "مكتمل" : "جاري"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {record.appointments?.doctors?.full_name}
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate">
                          {record.treatment_notes || "-"}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {!record.is_completed && (
                                <DropdownMenuItem onClick={() => handleMarkComplete(record)}>
                                  <CheckCircle className="h-4 w-4 ml-2" />
                                  تمييز كمكتمل
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => handleEditCost(record)}>
                                <Pencil className="h-4 w-4 ml-2" />
                                تعديل التكلفة
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDelete(record)}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 ml-2" />
                                حذف
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-4">
                {treatmentRecords?.map((record) => (
                  <Card
                    key={record.id}
                    className="p-4 cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/patient-profile/${record.appointments?.patients?.id}`)}
                  >
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium">
                            {record.appointments?.patients?.full_name}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {format(new Date(record.performed_at), "dd/MM/yyyy")}
                          </div>
                        </div>
                        <Badge variant={record.is_completed ? "default" : "secondary"}>
                          {record.is_completed ? "مكتمل" : "جاري"}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">رقم السن: </span>
                          {record.tooth_number}
                        </div>
                        <div>
                          <span className="text-muted-foreground">التكلفة: </span>
                          {record.actual_cost_syp ? `${record.actual_cost_syp.toLocaleString('en-US')} ل.س` : "-"} {record.actual_cost_usd ? `/ $${record.actual_cost_usd}` : ""}
                        </div>
                        <div className="col-span-2">
                          <span className="text-muted-foreground">العلاج: </span>
                          {record.sub_treatments?.name}
                        </div>
                        <div className="col-span-2">
                          <span className="text-muted-foreground">الطبيب: </span>
                          {record.appointments?.doctors?.full_name}
                        </div>
                        {record.treatment_notes && (
                          <div className="col-span-2">
                            <span className="text-muted-foreground">ملاحظات: </span>
                            {record.treatment_notes}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
                        {!record.is_completed && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleMarkComplete(record)}
                          >
                            <CheckCircle className="h-4 w-4 ml-1" />
                            إكمال
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditCost(record)}
                        >
                          <Pencil className="h-4 w-4 ml-1" />
                          تعديل التكلفة
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(record)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit Cost Dialog */}
      <Dialog open={isEditCostDialogOpen} onOpenChange={setIsEditCostDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل تكلفة العلاج</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>التكلفة بالليرة السورية</Label>
              <Input
                type="number"
                value={editCostSyp}
                onChange={(e) => setEditCostSyp(e.target.value)}
                placeholder="أدخل التكلفة بالليرة"
              />
            </div>
            <div>
              <Label>التكلفة بالدولار</Label>
              <Input
                type="number"
                value={editCostUsd}
                onChange={(e) => setEditCostUsd(e.target.value)}
                placeholder="أدخل التكلفة بالدولار"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditCostDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={() => {
                if (selectedTreatment) {
                  updateCostMutation.mutate({
                    id: selectedTreatment.id,
                    actual_cost_syp: parseFloat(editCostSyp) || 0,
                    actual_cost_usd: parseFloat(editCostUsd) || 0,
                  });
                }
              }}
            >
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Confirmation Dialog */}
      <Dialog open={isCompleteDialogOpen} onOpenChange={setIsCompleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد إتمام العلاج</DialogTitle>
            <DialogDescription>
              هل أنت متأكد من تمييز هذا العلاج كمكتمل؟
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCompleteDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={() => {
                if (selectedTreatment) {
                  markCompleteMutation.mutate(selectedTreatment.id);
                }
              }}
            >
              تأكيد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد الحذف</DialogTitle>
            <DialogDescription>
              هل أنت متأكد من حذف سجل العلاج هذا؟ لا يمكن التراجع عن هذا الإجراء.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedTreatment) {
                  deleteMutation.mutate(selectedTreatment.id);
                }
              }}
            >
              حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
