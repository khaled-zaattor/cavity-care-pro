import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Edit, FileText, Printer, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { toast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { PrescriptionDialog } from "@/components/PrescriptionDialog";
import { apiErrorMessage, prescriptionsApi, type Prescription } from "@/api/clinic";

/** الوصفات section of the patient profile. */
export function PatientPrescriptions({ patient }: { patient: { id: string; full_name: string } }) {
  const queryClient = useQueryClient();
  const { userRole, doctorId } = useUserRole();
  const canWrite = userRole === "super_admin" || userRole === "doctor";
  const [editing, setEditing] = useState<Prescription | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["prescriptions", "patient", patient.id],
    queryFn: () => prescriptionsApi.list({ patient_id: patient.id, per_page: 100 }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => prescriptionsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
      queryClient.invalidateQueries({ queryKey: ["medical-summary"] });
      toast({ title: "تم حذف الوصفة" });
    },
    onError: (e) => toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" }),
  });

  const rows = data?.data ?? [];
  // Doctors edit/delete their own prescriptions; the admin any.
  const mayChange = (p: Prescription) => userRole === "super_admin" || (userRole === "doctor" && p.doctor_id === doctorId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          الوصفات الطبية
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-center py-6 text-muted-foreground">جاري التحميل...</p>
        ) : rows.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p>لا توجد وصفات لهذا المريض</p>
            {canWrite && <p className="text-xs mt-1">استخدم زر «وصفة طبية» في الإجراءات السريعة</p>}
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((p) => (
              <li key={p.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold">وصفة رقم {p.number}</span>
                    <span className="text-muted-foreground" dir="ltr">{format(new Date(p.issued_at), "yyyy-MM-dd")}</span>
                    {p.doctor?.full_name && <span className="text-muted-foreground">— {p.doctor.full_name}</span>}
                    {p.printed_at ? <Badge variant="secondary">مطبوعة</Badge> : <Badge variant="outline">لم تطبع</Badge>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => window.open(`/print/prescription/${p.id}`, "_blank")}>
                      <Printer className="h-4 w-4 ms-1" />
                      طباعة
                    </Button>
                    {mayChange(p) && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="outline">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent dir="rtl">
                            <AlertDialogHeader>
                              <AlertDialogTitle>حذف الوصفة رقم {p.number}؟</AlertDialogTitle>
                              <AlertDialogDescription>لن يُعاد استخدام رقمها. يمكن للمدير استرجاعها لاحقاً.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>إلغاء</AlertDialogCancel>
                              <AlertDialogAction onClick={() => remove.mutate(p.id)}>حذف</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </div>
                </div>
                {p.diagnosis && <p className="mt-1 text-sm"><span className="text-muted-foreground">التشخيص: </span>{p.diagnosis}</p>}
                <p className="mt-1 text-sm text-muted-foreground">
                  {p.items.map((i) => i.medicine_name).join("، ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <PrescriptionDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        patient={patient}
        prescription={editing}
      />
    </Card>
  );
}
