import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText } from "lucide-react";
import type { Appointment, Balance, Doctor, Patient, Treatment } from "@/api/clinic";
import { fmtDate } from "./utils";
import { ScheduleAppointmentDialog } from "./ScheduleAppointmentDialog";
import { TreatmentPlanDialog } from "./TreatmentPlanDialog";

interface PatientInfoCardsProps {
  patient: Patient;
  patientId: string;
  balance: Balance | undefined;
  doctors: Doctor[] | undefined;
  treatments: Treatment[] | undefined;
  patientFutureAppointments: Appointment[] | undefined;
  canPrescribe: boolean;
  setIsPrescriptionOpen: Dispatch<SetStateAction<boolean>>;
  showError: (e: unknown) => void;
}

/** Patient info, balance (incl. per books / per specialty) and quick actions cards. */
export function PatientInfoCards({
  patient,
  patientId,
  balance,
  doctors,
  treatments,
  patientFutureAppointments,
  canPrescribe,
  setIsPrescriptionOpen,
  showError,
}: PatientInfoCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>معلومات المريض</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div>
            <strong>تاريخ الميلاد:</strong> {fmtDate(patient.date_of_birth)}
          </div>
          <div>
            <strong>الهاتف:</strong> {patient.phone_number}
          </div>
          {patient.contact && (
            <div>
              <strong>جهة الاتصال:</strong> {patient.contact}
            </div>
          )}
          {patient.medical_notes && (
            <div>
              <strong>الملاحظات الطبية:</strong> {patient.medical_notes}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>الرصيد</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div>
              <div className={`text-xl font-bold ${balance?.syp && balance.syp > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {Math.round(Math.abs(balance?.syp || 0)).toLocaleString('en-US')} ل.س
              </div>
              <p className="text-xs text-muted-foreground">{balance?.syp && balance.syp > 0 ? 'مستحق بالليرة' : 'رصيد زائد بالليرة'}</p>
            </div>
            <div>
              <div className={`text-xl font-bold ${balance?.usd && balance.usd > 0 ? 'text-red-600' : 'text-green-600'}`}>
                ${Math.round(Math.abs(balance?.usd || 0)).toLocaleString('en-US')}
              </div>
              <p className="text-xs text-muted-foreground">{balance?.usd && balance.usd > 0 ? 'مستحق بالدولار' : 'رصيد زائد بالدولار'}</p>
            </div>
            {balance?.by_books && balance.by_books.length > 1 && (
              <div className="border-t pt-2 space-y-1 text-xs">
                {balance.by_books.map((b) => (
                  <div key={b.doctor_id ?? "clinic"} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">
                      {b.doctor_id ? `د. ${b.name}` : "العيادة"}
                    </span>
                    <span>
                      {Math.round(b.syp).toLocaleString('en-US')} ل.س / ${Math.round(b.usd).toLocaleString('en-US')}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {balance?.by_specialty && balance.by_specialty.length > 1 && (
              <div className="border-t pt-2 space-y-1 text-xs">
                <div className="font-medium">حسب التخصص</div>
                {balance.by_specialty.map((s) => (
                  <div key={s.specialty_id ?? "none"} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{s.name}</span>
                    <span>
                      {Math.round(s.syp).toLocaleString('en-US')} ل.س / ${Math.round(s.usd).toLocaleString('en-US')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>إجراءات سريعة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
            <ScheduleAppointmentDialog
              patientId={patientId}
              doctors={doctors}
              patientFutureAppointments={patientFutureAppointments}
              showError={showError}
            />

          {canPrescribe && (
            <Button className="w-full" variant="outline" onClick={() => setIsPrescriptionOpen(true)}>
              <FileText className="ml-2 h-4 w-4" />
              وصفة طبية
            </Button>
          )}

            <TreatmentPlanDialog
              patientId={patientId}
              doctors={doctors}
              treatments={treatments}
              showError={showError}
            />
        </CardContent>
      </Card>
    </div>
  );
}
