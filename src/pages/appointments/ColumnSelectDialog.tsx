import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { availableTableColumns } from "./utils";

interface ColumnSelectDialogProps {
  isColumnSelectDialogOpen: boolean;
  setIsColumnSelectDialogOpen: Dispatch<SetStateAction<boolean>>;
  visibleTableColumns: string[];
  setVisibleTableColumns: Dispatch<SetStateAction<string[]>>;
}

/** Choose which table columns are visible (persisted by the page in localStorage). */
export function ColumnSelectDialog({
  isColumnSelectDialogOpen,
  setIsColumnSelectDialogOpen,
  visibleTableColumns,
  setVisibleTableColumns,
}: ColumnSelectDialogProps) {
  return (
    <Dialog open={isColumnSelectDialogOpen} onOpenChange={setIsColumnSelectDialogOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>اختر الأعمدة المرئية</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-3">
            {availableTableColumns.map((column) => (
              <div key={column.id} className="flex items-center space-x-2 space-x-reverse">
                <Checkbox
                  id={`table-${column.id}`}
                  checked={visibleTableColumns.includes(column.id)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setVisibleTableColumns([...visibleTableColumns, column.id]);
                    } else {
                      setVisibleTableColumns(visibleTableColumns.filter(id => id !== column.id));
                    }
                  }}
                />
                <Label
                  htmlFor={`table-${column.id}`}
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
                if (visibleTableColumns.length === availableTableColumns.length) {
                  setVisibleTableColumns([]);
                } else {
                  setVisibleTableColumns(availableTableColumns.map(col => col.id));
                }
              }}
            >
              {visibleTableColumns.length === availableTableColumns.length ? 'إلغاء الكل' : 'تحديد الكل'}
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setIsColumnSelectDialogOpen(false)}
              >
                إلغاء
              </Button>
              <Button
                onClick={() => setIsColumnSelectDialogOpen(false)}
              >
                حفظ
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
