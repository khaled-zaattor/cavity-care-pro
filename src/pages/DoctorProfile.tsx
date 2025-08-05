import { useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Calendar, Phone, Mail, User, Filter, CalendarDays } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Doctor {
  id: string;
  full_name: string;
  email: string;
  phone_number: string;
  specialty: string;
}

interface Appointment {
  id: string;
  scheduled_at: string;
  status: string;
  notes: string | null;
  patient_id: string;
  patients: {
    full_name: string;
    phone_number: string;
  };
}

export default function DoctorProfile() {
  const { doctorId } = useParams<{ doctorId: string }>();
  const [dateFilter, setDateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data: doctor } = useQuery({
    queryKey: ["doctor", doctorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doctors")
        .select("*")
        .eq("id", doctorId)
        .maybeSingle();
      if (error) throw error;
      return data as Doctor;
    },
    enabled: !!doctorId,
  });

  const { data: appointments, isLoading } = useQuery({
    queryKey: ["doctor-appointments", doctorId, dateFilter, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("appointments")
        .select(`
          *,
          patients (
            full_name,
            phone_number
          )
        `)
        .eq("doctor_id", doctorId);

      if (dateFilter) {
        const startDate = new Date(dateFilter);
        const endDate = new Date(dateFilter);
        endDate.setDate(endDate.getDate() + 1);
        
        query = query
          .gte("scheduled_at", startDate.toISOString())
          .lt("scheduled_at", endDate.toISOString());
      }

      if (statusFilter) {
        query = query.eq("status", statusFilter as any);
      }

      const { data, error } = await query.order("scheduled_at", { ascending: false });
      if (error) throw error;
      return data as Appointment[];
    },
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
                          {appointment.patients?.full_name}
                        </TableCell>
                        <TableCell>{appointment.patients?.phone_number}</TableCell>
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
                          {appointment.patients?.full_name}
                        </h3>
                        {getStatusBadge(appointment.status)}
                      </div>
                      
                      <div className="grid grid-cols-1 gap-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">رقم الهاتف:</span>
                          <span>{appointment.patients?.phone_number}</span>
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