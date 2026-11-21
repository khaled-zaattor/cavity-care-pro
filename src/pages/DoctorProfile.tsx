import { useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Calendar, Phone, Mail, User, Filter, CalendarDays } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { appointmentsApi, AppointmentStatus, dayEndIso, dayStartIso, doctorsApi } from "@/api/clinic";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function DoctorProfile() {
  const { doctorId } = useParams<{ doctorId: string }>();
  const [dateFilter, setDateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data: doctor } = useQuery({
    queryKey: ["doctor", doctorId],
    queryFn: () => doctorsApi.get(doctorId!),
    enabled: !!doctorId,
  });

  // Last 500 appointments of this doctor (or one day when a date is picked).
  const { data: appointments, isLoading } = useQuery({
    queryKey: ["doctor-appointments", doctorId, dateFilter, statusFilter],
    queryFn: () =>
      appointmentsApi
        .list({
          doctor_id: doctorId,
          status: (statusFilter || undefined) as AppointmentStatus | undefined,
          from: dateFilter ? dayStartIso(dateFilter) : undefined,
          to: dateFilter ? dayEndIso(dateFilter) : undefined,
          per_page: 500,
        })
        .then((r) => r.data),
    enabled: !!doctorId,
  });

  const getStatusBadge = (status: string) => {
    const statusMap = {
      Scheduled: { label: "مجدول", variant: "default" as const },
      Confirmed: { label: "مؤكد", variant: "secondary" as const },
      Cancelled: { label: "ملغي", variant: "destructive" as const },
      Completed: { label: "مكتمل", variant: "outline" as const },
    };
    
    const statusInfo = statusMap[status as keyof typeof statusMap] || { label: status, variant: "default" as const };
    return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
  };

  const clearFilters = () => {
    setDateFilter("");
    setStatusFilter("");
  };

  if (!doctor) {
    return (
      <div className="space-y-4 lg:space-y-6">
        <div className="text-center py-8">جاري تحميل بيانات الدكتور...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Doctor Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            معلومات الدكتور
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <h3 className="font-semibold text-lg">{doctor.full_name}</h3>
              <p className="text-sm text-muted-foreground">الاسم الكامل</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{doctor.email}</span>
              </div>
              <p className="text-sm text-muted-foreground">البريد الإلكتروني</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{doctor.phone_number}</span>
              </div>
              <p className="text-sm text-muted-foreground">رقم الهاتف</p>
            </div>
            <div className="space-y-2">
              <Badge variant="secondary" className="text-sm">
                {doctor.specialty}
              </Badge>
              <p className="text-sm text-muted-foreground">التخصص</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            فلتر المواعيد
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">التاريخ</label>
              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full"
              />
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">الحالة</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Scheduled">مجدول</SelectItem>
                  <SelectItem value="Confirmed">مؤكد</SelectItem>
                  <SelectItem value="Cancelled">ملغي</SelectItem>
                  <SelectItem value="Completed">مكتمل</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button 
              variant="outline" 
              onClick={clearFilters}
              className="w-full sm:w-auto"
            >
              مسح الفلاتر
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Appointments Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            مواعيد الدكتور {doctor.full_name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">جاري تحميل المواعيد...</div>
          ) : !appointments || appointments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              لا توجد مواعيد مطابقة للفلاتر المحددة
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>المريض</TableHead>
                      <TableHead>رقم الهاتف</TableHead>
                      <TableHead>تاريخ ووقت الموعد</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead>الملاحظات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {appointments.map((appointment) => (
                      <TableRow key={appointment.id}>
                        <TableCell className="font-medium">
                          {appointment.patient?.full_name}
                        </TableCell>
                        <TableCell>{appointment.patient?.phone_number}</TableCell>
                        <TableCell>
                          {new Date(appointment.scheduled_at).toLocaleString("ar-EG", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell>{getStatusBadge(appointment.status)}</TableCell>
                        <TableCell>{appointment.notes || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-4">
                {appointments.map((appointment) => (
                  <Card key={appointment.id} className="p-4">
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <h3 className="font-semibold text-lg">
                          {appointment.patient?.full_name}
                        </h3>
                        {getStatusBadge(appointment.status)}
                      </div>
                      
                      <div className="grid grid-cols-1 gap-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">رقم الهاتف:</span>
                          <span>{appointment.patient?.phone_number}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">تاريخ الموعد:</span>
                          <span className="text-right">
                            {new Date(appointment.scheduled_at).toLocaleString("ar-EG", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        {appointment.notes && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">الملاحظات:</span>
                            <span className="text-right">{appointment.notes}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}