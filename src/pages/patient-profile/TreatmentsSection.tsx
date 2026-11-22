import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Edit, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage, moneyApi, type TreatmentRecord } from "@/api/clinic";
import { fmtDate } from "./utils";

interface TreatmentsSectionProps {
  activeSection: string;
  patientId: string;
  allTreatmentRecords: TreatmentRecord[] | undefined;
  invalidatePatientMoney: () => void;
  showError: (e: unknown) => void;
}

/**
 * "جميع العلاجات" card (shown for the "all" / "treatments" sections) plus its
 * edit-cost and delete dialogs, which stay mounted whatever the section.
 */
export function TreatmentsSection({ activeSection, patientId, allTreatmentRecords, invalidatePatientMoney, showError }: TreatmentsSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDeleteTreatmentDialogOpen, setIsDeleteTreatmentDialogOpen] = useState(false);
  const [treatmentToDelete, setTreatmentToDelete] = useState<string | null>(null);
  const [isEditTreatmentCostDialogOpen, setIsEditTreatmentCostDialogOpen] = useState(false);
  const [selectedTreatmentRecord, setSelectedTreatmentRecord] = useState<TreatmentRecord | null>(null);
  const [editingTreatmentCostSyp, setEditingTreatmentCostSyp] = useState("");
  const [editingTreatmentCostUsd, setEditingTreatmentCostUsd] = useState("");

  // Mutation to mark sub-treatment as completed
  const markCompleteMutation = useMutation({
    mutationFn: (recordId: string) => moneyApi.updateRecord(recordId, { is_completed: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unfinished-sub-treatments", patientId] });
      invalidatePatientMoney();
      toast({ title: "تم", description: "تم وضع علامة مكتمل" });
    },
    onError: showError,
  });

  // Mutation to delete treatment record
  const deleteTreatmentMutation = useMutation({
    mutationFn: (recordId: string) => moneyApi.removeRecord(recordId),
    onSuccess: () => {
      invalidatePatientMoney();
      queryClient.invalidateQueries({ queryKey: ["unfinished-sub-treatments", patientId] });
      setIsDeleteTreatmentDialogOpen(false);
      setTreatmentToDelete(null);
      toast({ title: "تم الحذف", description: "تم حذف العلاج بنجاح" });
    },
    onError: (e) => {
      toast({
        title: "خطأ",
        description: apiErrorMessage(e) || "حدث خطأ أثناء حذف العلاج",
        variant: "destructive"
      });
    },
  });

  // Update treatment cost mutation
  const updateTreatmentCostMutation = useMutation({
    mutationFn: ({ treatmentRecordId, newCostSyp, newCostUsd }: { treatmentRecordId: string; newCostSyp: number; newCostUsd: number }) =>
      moneyApi.updateRecord(treatmentRecordId, { actual_cost_syp: newCostSyp, actual_cost_usd: newCostUsd }),
    onSuccess: () => {
      invalidatePatientMoney();
      setIsEditTreatmentCostDialogOpen(false);
      setEditingTreatmentCostSyp("");
      setEditingTreatmentCostUsd("");
      toast({ title: "نجح", description: "تم تعديل كلفة العلاج بنجاح" });
    },
    onError: showError,
  });

  return (
    <>
      {/* All Treatment Records Section */}
      {(activeSection === "all" || activeSection === "treatments") && (
        <Card>
          <CardHeader>
            <CardTitle>جميع العلاجات</CardTitle>
          </CardHeader>
          <CardContent>
            {allTreatmentRecords && allTreatmentRecords.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">العلاج الفرعي</TableHead>
                    <TableHead className="text-right">رقم السن</TableHead>
                    <TableHead className="text-right">الخطوات المنفذة</TableHead>
                    <TableHead className="text-right">التكلفة (ل.س)</TableHead>
                    <TableHead className="text-right">التكلفة ($)</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">الطبيب</TableHead>
                    <TableHead className="text-right">ملاحظة العلاج</TableHead>
                    <TableHead className="text-right">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allTreatmentRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        {fmtDate(record.appointment?.scheduled_at)}
                      </TableCell>
                      <TableCell>{record.sub_treatment?.name}</TableCell>
                      <TableCell>{record.tooth_number}</TableCell>
                      <TableCell>
                        {record.executed_steps && record.executed_steps.length > 0 ? (
                          <div className="text-sm space-y-1">
                            {record.executed_steps.map((step, idx) => (
                              <div key={idx} className="flex items-center gap-1">
                                <span className="text-green-600">✓</span>
                                <span>{step || '-'}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {record.actual_cost_syp ? `${Math.round(record.actual_cost_syp).toLocaleString('en-US')} ل.س` : '-'}
                      </TableCell>
                      <TableCell className="font-semibold text-blue-600">
                        {record.actual_cost_usd ? `$${Math.round(record.actual_cost_usd).toLocaleString('en-US')}` : '-'}
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded text-xs ${
                          record.is_completed 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-orange-100 text-orange-800'
                        }`}>
                          {record.is_completed ? 'مكتمل' : 'غير مكتمل'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {record.appointment?.doctor?.full_name || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-muted-foreground max-w-xs whitespace-pre-wrap">
                          {record.treatment_notes 
                            ? [...new Set(record.treatment_notes.split('\n').filter((line) => line.trim()))].join('\n') 
                            : '-'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {!record.is_completed && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => markCompleteMutation.mutate(record.id)}
                              disabled={markCompleteMutation.isPending}
                            >
                              تمييز كمكتمل
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedTreatmentRecord(record);
                              setEditingTreatmentCostSyp(record.actual_cost_syp?.toString() || "");
                              setEditingTreatmentCostUsd(record.actual_cost_usd?.toString() || "");
                              setIsEditTreatmentCostDialogOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4 ml-1" />
                            تعديل كلفة
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              setTreatmentToDelete(record.id);
                              setIsDeleteTreatmentDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>لا توجد علاجات مسجلة لهذا المريض</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Edit Treatment Cost Dialog */}
      <Dialog open={isEditTreatmentCostDialogOpen} onOpenChange={setIsEditTreatmentCostDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل كلفة العلاج</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedTreatmentRecord && (
              <>
                <div className="space-y-2">
                  <div className="text-sm">
                    <span className="font-semibold">العلاج الفرعي:</span> {selectedTreatmentRecord.sub_treatment?.name}
                  </div>
                  <div className="text-sm">
                    <span className="font-semibold">رقم السن:</span> {selectedTreatmentRecord.tooth_number}
                  </div>
                  <div className="text-sm">
                    <span className="font-semibold">التاريخ:</span> {fmtDate(selectedTreatmentRecord.appointment?.scheduled_at)}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>الكلفة الحالية</Label>
                  <div className="font-semibold text-lg">
                    {Math.round(selectedTreatmentRecord.actual_cost_syp || 0).toLocaleString('en-US')} ل.س
                    {" / "}
                    ${Math.round(selectedTreatmentRecord.actual_cost_usd || 0).toLocaleString('en-US')}
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="new-cost-syp">الكلفة بالليرة السورية</Label>
                    <Input
                      id="new-cost-syp"
                      type="text"
                      placeholder="أدخل الكلفة بالليرة"
                      value={editingTreatmentCostSyp}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^\d]/g, '');
                        setEditingTreatmentCostSyp(value);
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-cost-usd">الكلفة بالدولار</Label>
                    <Input
                      id="new-cost-usd"
                      type="text"
                      placeholder="أدخل الكلفة بالدولار"
                      value={editingTreatmentCostUsd}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^\d.]/g, '');
                        setEditingTreatmentCostUsd(value);
                      }}
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setIsEditTreatmentCostDialogOpen(false)}
                  >
                    إلغاء
                  </Button>
                  <Button
                    disabled={updateTreatmentCostMutation.isPending}
                    onClick={() => {
                      updateTreatmentCostMutation.mutate({
                        treatmentRecordId: selectedTreatmentRecord.id,
                        newCostSyp: parseFloat(editingTreatmentCostSyp) || 0,
                        newCostUsd: parseFloat(editingTreatmentCostUsd) || 0
                      });
                    }}
                  >
                    {updateTreatmentCostMutation.isPending ? "جاري الحفظ..." : "حفظ"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Treatment Confirmation Dialog */}
      <AlertDialog open={isDeleteTreatmentDialogOpen} onOpenChange={setIsDeleteTreatmentDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف هذا العلاج؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (treatmentToDelete) {
                  deleteTreatmentMutation.mutate(treatmentToDelete);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
