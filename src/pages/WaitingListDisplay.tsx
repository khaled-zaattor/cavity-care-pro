import { useQuery } from "@tanstack/react-query";
import { waitingListApi, type WaitingEntry } from "@/api/clinic";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function WaitingListDisplay() {
  // لا يوجد realtime: تحديث كل 5 ثوانٍ (يحدّث أيضاً وقت الانتظار المعروض)
  const { data } = useQuery({
    queryKey: ["waiting-list", "active"],
    queryFn: () => waitingListApi.list(true),
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });
  const waitingPatients: WaitingEntry[] = data?.data ?? [];

  const getStatusBadge = (status: string) => {
    if (status === 'waiting') {
      return <Badge variant="default">في الانتظار</Badge>;
    }
    return <Badge variant="secondary">في الفحص</Badge>;
  };

  const calculateWaitingTime = (arrivalTime: string) => {
    const now = new Date();
    const arrival = new Date(arrivalTime);
    const diff = Math.floor((now.getTime() - arrival.getTime()) / 60000);
    return `${diff} دقيقة`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-8" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-6xl font-bold mb-4 text-foreground">لائحة الانتظار</h1>
          <p className="text-2xl text-muted-foreground">
            {format(new Date(), "EEEE، d MMMM yyyy", { locale: ar })}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {waitingPatients.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="text-3xl text-muted-foreground">لا يوجد مرضى في الانتظار حالياً</p>
            </Card>
          ) : (
            waitingPatients.map((patient) => (
              <Card key={patient.id} className="p-8 hover:shadow-xl transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h2 className="text-4xl font-bold mb-4 text-foreground">
                      {patient.patient?.full_name}
                    </h2>
                    {patient.doctor && (
                      <p className="text-2xl text-primary mb-4">د. {patient.doctor.full_name}</p>
                    )}
                    
                    <div className="grid grid-cols-3 gap-6 text-xl">
                      <div>
                        <p className="text-muted-foreground mb-2">وقت الموعد</p>
                        <p className="font-semibold text-foreground">
                          {patient.appointment
                            ? format(new Date(patient.appointment.scheduled_at), "p", { locale: ar })
                            : "غير محدد"}
                        </p>
                      </div>
                      
                      <div>
                        <p className="text-muted-foreground mb-2">وقت الوصول</p>
                        <p className="font-semibold text-foreground">
                          {format(new Date(patient.clinic_arrival_time), "p", { locale: ar })}
                        </p>
                      </div>
                      
                      <div>
                        <p className="text-muted-foreground mb-2">وقت الانتظار</p>
                        <p className="font-semibold text-primary">
                          {calculateWaitingTime(patient.clinic_arrival_time)}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mr-6">
                    {getStatusBadge(patient.status)}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
