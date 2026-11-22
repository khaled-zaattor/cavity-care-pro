import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { apiErrorMessage, patientsApi } from "@/api/clinic";

type Candidate = { id: string; full_name: string; phone_number: string | null; created_at: string };

/**
 * One button (admin): delete duplicate patients that have no appointments
 * and nothing else attached. Shows the exact list first; one copy of every
 * name is always kept, and deleted patients can be restored by the admin.
 */
export function DuplicatePatientsCleanup() {
  const queryClient = useQueryClient();
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [loading, setLoading] = useState(false);

  const openPreview = async () => {
    setLoading(true);
    try {
      const res = await patientsApi.duplicatesPreview();
      if (res.count === 0) {
        toast({ title: "لا يوجد مرضى مكررون للحذف", description: "كل نسخة مكررة لديها مواعيد أو بيانات مرتبطة" });
        return;
      }
      setCandidates(res.data);
    } catch (e) {
      toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const cleanup = useMutation({
    mutationFn: (ids: string[]) => patientsApi.duplicatesCleanup(ids),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      setCandidates(null);
      toast({ title: `تم حذف ${res.deleted} مريضاً مكرراً`, description: "يمكن للمدير استرجاعهم عند الحاجة" });
    },
    onError: (e) => toast({ title: "خطأ", description: apiErrorMessage(e), variant: "destructive" }),
  });

  return (
    <>
      <Button variant="outline" size="sm" onClick={openPreview} disabled={loading} className="text-destructive">
        <UserX className="h-4 w-4 ms-1" />
        {loading ? "جاري الفحص..." : "حذف المكررين بدون مواعيد"}
      </Button>

      <AlertDialog open={!!candidates} onOpenChange={(o) => !o && setCandidates(null)}>
        <AlertDialogContent dir="rtl" className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف {candidates?.length} مريضاً مكرراً بدون مواعيد؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف النسخ المكررة التي ليس لها أي موعد أو علاج أو دفعة أو وصفة أو ملف. تبقى نسخة واحدة على الأقل من كل اسم،
              ويمكن للمدير استرجاع المحذوفين لاحقاً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-72 overflow-y-auto rounded-md border text-sm">
            <table className="w-full">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="p-2 text-start font-medium">الاسم</th>
                  <th className="p-2 text-start font-medium">الهاتف</th>
                  <th className="p-2 text-start font-medium">تاريخ الإضافة</th>
                </tr>
              </thead>
              <tbody>
                {candidates?.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="p-2">{c.full_name}</td>
                    <td className="p-2" dir="ltr">{c.phone_number || "—"}</td>
                    <td className="p-2" dir="ltr">{format(new Date(c.created_at), "yyyy-MM-dd")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={cleanup.isPending}
              onClick={(e) => {
                e.preventDefault();
                cleanup.mutate(candidates!.map((c) => c.id));
              }}
            >
              {cleanup.isPending ? "جاري الحذف..." : `حذف ${candidates?.length ?? 0}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
