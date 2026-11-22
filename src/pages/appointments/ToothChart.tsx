import type { Dispatch, SetStateAction } from "react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { TreatmentRecordForm } from "./utils";

interface ToothChartProps {
  teethType: "adult" | "child";
  setTeethType: Dispatch<SetStateAction<"adult" | "child">>;
  treatmentRecord: TreatmentRecordForm;
  setTreatmentRecord: Dispatch<SetStateAction<TreatmentRecordForm>>;
  isSingleToothOnly: boolean;
}

/** FDI teeth chart (adult / child) used by the record-treatment dialog. */
export function ToothChart({ teethType, setTeethType, treatmentRecord, setTreatmentRecord, isSingleToothOnly }: ToothChartProps) {
  return (
    <div className="border rounded-lg p-3 bg-muted/30">
      <div className="flex items-center justify-between mb-3">
        <div className="text-center text-xs font-medium flex-1">
          مخطط الأسنان - النظام العالمي
          {isSingleToothOnly && (
            <span className="block text-xs text-primary mt-1">يُسمح باختيار سن واحد فقط</span>
          )}
        </div>
      </div>

      {/* اختيار نوع الأسنان */}
      <div className="mb-3">
        <RadioGroup value={teethType} onValueChange={(value: "adult" | "child") => {
          setTeethType(value);
          setTreatmentRecord({ ...treatmentRecord, tooth_numbers: [] });
        }} className="flex gap-4 justify-center">
          <div className="flex items-center space-x-2 space-x-reverse">
            <RadioGroupItem value="adult" id="adult" />
            <Label htmlFor="adult" className="cursor-pointer">أسنان البالغين</Label>
          </div>
          <div className="flex items-center space-x-2 space-x-reverse">
            <RadioGroupItem value="child" id="child" />
            <Label htmlFor="child" className="cursor-pointer">أسنان الأطفال</Label>
          </div>
        </RadioGroup>
      </div>

      {teethType === "adult" ? (
        <>
          {/* أسنان البالغين */}
          <div className="mb-2">
            <div className="flex gap-0.5 justify-center items-center">
              {[28, 27, 26, 25, 24, 23, 22, 21].map((toothNum) => (
                <button
                  key={toothNum}
                  type="button"
                  onClick={() => {
                    const toothStr = toothNum.toString();
                    if (isSingleToothOnly) {
                      // For single tooth, replace selection
                      setTreatmentRecord({ ...treatmentRecord, tooth_numbers: [toothStr] });
                    } else {
                      // For multiple teeth, toggle selection
                      const newTeeth = treatmentRecord.tooth_numbers.includes(toothStr)
                        ? treatmentRecord.tooth_numbers.filter(t => t !== toothStr)
                        : [...treatmentRecord.tooth_numbers, toothStr];
                      setTreatmentRecord({ ...treatmentRecord, tooth_numbers: newTeeth });
                    }
                  }}
                  className={`h-[25px] w-[25px] text-xs font-medium border rounded transition-colors ${treatmentRecord.tooth_numbers.includes(toothNum.toString())
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-muted border-border'
                    }`}
                >
                  {toothNum}
                </button>
              ))}
              <div className="w-px h-[25px] bg-border mx-0.5" />
              {[11, 12, 13, 14, 15, 16, 17, 18].map((toothNum) => (
                <button
                  key={toothNum}
                  type="button"
                  onClick={() => {
                    const toothStr = toothNum.toString();
                    if (isSingleToothOnly) {
                      setTreatmentRecord({ ...treatmentRecord, tooth_numbers: [toothStr] });
                    } else {
                      const newTeeth = treatmentRecord.tooth_numbers.includes(toothStr)
                        ? treatmentRecord.tooth_numbers.filter(t => t !== toothStr)
                        : [...treatmentRecord.tooth_numbers, toothStr];
                      setTreatmentRecord({ ...treatmentRecord, tooth_numbers: newTeeth });
                    }
                  }}
                  className={`h-[25px] w-[25px] text-xs font-medium border rounded transition-colors ${treatmentRecord.tooth_numbers.includes(toothNum.toString())
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-muted border-border'
                    }`}
                >
                  {toothNum}
                </button>
              ))}
            </div>
          </div>

          <div className="h-px bg-border my-2" />

          <div>
            <div className="flex gap-0.5 justify-center items-center">
              {[38, 37, 36, 35, 34, 33, 32, 31].map((toothNum) => (
                <button
                  key={toothNum}
                  type="button"
                  onClick={() => {
                    const toothStr = toothNum.toString();
                    if (isSingleToothOnly) {
                      setTreatmentRecord({ ...treatmentRecord, tooth_numbers: [toothStr] });
                    } else {
                      const newTeeth = treatmentRecord.tooth_numbers.includes(toothStr)
                        ? treatmentRecord.tooth_numbers.filter(t => t !== toothStr)
                        : [...treatmentRecord.tooth_numbers, toothStr];
                      setTreatmentRecord({ ...treatmentRecord, tooth_numbers: newTeeth });
                    }
                  }}
                  className={`h-[25px] w-[25px] text-xs font-medium border rounded transition-colors ${treatmentRecord.tooth_numbers.includes(toothNum.toString())
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-muted border-border'
                    }`}
                >
                  {toothNum}
                </button>
              ))}
              <div className="w-px h-[25px] bg-border mx-0.5" />
              {[41, 42, 43, 44, 45, 46, 47, 48].map((toothNum) => (
                <button
                  key={toothNum}
                  type="button"
                  onClick={() => {
                    const toothStr = toothNum.toString();
                    if (isSingleToothOnly) {
                      setTreatmentRecord({ ...treatmentRecord, tooth_numbers: [toothStr] });
                    } else {
                      const newTeeth = treatmentRecord.tooth_numbers.includes(toothStr)
                        ? treatmentRecord.tooth_numbers.filter(t => t !== toothStr)
                        : [...treatmentRecord.tooth_numbers, toothStr];
                      setTreatmentRecord({ ...treatmentRecord, tooth_numbers: newTeeth });
                    }
                  }}
                  className={`h-[25px] w-[25px] text-xs font-medium border rounded transition-colors ${treatmentRecord.tooth_numbers.includes(toothNum.toString())
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-muted border-border'
                    }`}
                >
                  {toothNum}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* أسنان الأطفال */}
          <div className="mb-2">
            <div className="flex gap-0.5 justify-center items-center">
              {[65, 64, 63, 62, 61].map((toothNum) => (
                <button
                  key={toothNum}
                  type="button"
                  onClick={() => {
                    const toothStr = toothNum.toString();
                    if (isSingleToothOnly) {
                      setTreatmentRecord({ ...treatmentRecord, tooth_numbers: [toothStr] });
                    } else {
                      const newTeeth = treatmentRecord.tooth_numbers.includes(toothStr)
                        ? treatmentRecord.tooth_numbers.filter(t => t !== toothStr)
                        : [...treatmentRecord.tooth_numbers, toothStr];
                      setTreatmentRecord({ ...treatmentRecord, tooth_numbers: newTeeth });
                    }
                  }}
                  className={`h-[25px] w-[25px] text-xs font-medium border rounded transition-colors ${treatmentRecord.tooth_numbers.includes(toothNum.toString())
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-muted border-border'
                    }`}
                >
                  {toothNum}
                </button>
              ))}
              <div className="w-px h-[25px] bg-border mx-0.5" />
              {[51, 52, 53, 54, 55].map((toothNum) => (
                <button
                  key={toothNum}
                  type="button"
                  onClick={() => {
                    const toothStr = toothNum.toString();
                    if (isSingleToothOnly) {
                      setTreatmentRecord({ ...treatmentRecord, tooth_numbers: [toothStr] });
                    } else {
                      const newTeeth = treatmentRecord.tooth_numbers.includes(toothStr)
                        ? treatmentRecord.tooth_numbers.filter(t => t !== toothStr)
                        : [...treatmentRecord.tooth_numbers, toothStr];
                      setTreatmentRecord({ ...treatmentRecord, tooth_numbers: newTeeth });
                    }
                  }}
                  className={`h-[25px] w-[25px] text-xs font-medium border rounded transition-colors ${treatmentRecord.tooth_numbers.includes(toothNum.toString())
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-muted border-border'
                    }`}
                >
                  {toothNum}
                </button>
              ))}
            </div>
          </div>

          <div className="h-px bg-border my-2" />

          <div>
            <div className="flex gap-0.5 justify-center items-center">
              {[75, 74, 73, 72, 71].map((toothNum) => (
                <button
                  key={toothNum}
                  type="button"
                  onClick={() => {
                    const toothStr = toothNum.toString();
                    if (isSingleToothOnly) {
                      setTreatmentRecord({ ...treatmentRecord, tooth_numbers: [toothStr] });
                    } else {
                      const newTeeth = treatmentRecord.tooth_numbers.includes(toothStr)
                        ? treatmentRecord.tooth_numbers.filter(t => t !== toothStr)
                        : [...treatmentRecord.tooth_numbers, toothStr];
                      setTreatmentRecord({ ...treatmentRecord, tooth_numbers: newTeeth });
                    }
                  }}
                  className={`h-[25px] w-[25px] text-xs font-medium border rounded transition-colors ${treatmentRecord.tooth_numbers.includes(toothNum.toString())
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-muted border-border'
                    }`}
                >
                  {toothNum}
                </button>
              ))}
              <div className="w-px h-[25px] bg-border mx-0.5" />
              {[81, 82, 83, 84, 85].map((toothNum) => (
                <button
                  key={toothNum}
                  type="button"
                  onClick={() => {
                    const toothStr = toothNum.toString();
                    if (isSingleToothOnly) {
                      setTreatmentRecord({ ...treatmentRecord, tooth_numbers: [toothStr] });
                    } else {
                      const newTeeth = treatmentRecord.tooth_numbers.includes(toothStr)
                        ? treatmentRecord.tooth_numbers.filter(t => t !== toothStr)
                        : [...treatmentRecord.tooth_numbers, toothStr];
                      setTreatmentRecord({ ...treatmentRecord, tooth_numbers: newTeeth });
                    }
                  }}
                  className={`h-[25px] w-[25px] text-xs font-medium border rounded transition-colors ${treatmentRecord.tooth_numbers.includes(toothNum.toString())
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-muted border-border'
                    }`}
                >
                  {toothNum}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {treatmentRecord.tooth_numbers.length > 0 && (
        <div className="mt-2 text-center text-xs text-primary">
          الأسنان المحددة: {treatmentRecord.tooth_numbers.sort((a, b) => parseInt(a) - parseInt(b)).join(", ")}
        </div>
      )}
    </div>
  );
}
