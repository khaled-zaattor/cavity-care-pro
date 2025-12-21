import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Shield, Calendar, Stethoscope, CreditCard, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type AppRole = "super_admin" | "doctor" | "dentist_assistant" | "receptionist";

interface RolePermission {
  id: string;
  role: AppRole;
  resource: string;
  can_create: boolean;
  can_update: boolean;
  can_delete: boolean;
}

const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "المدير العام",
  doctor: "طبيب",
  dentist_assistant: "مساعد طبيب",
  receptionist: "موظف استقبال",
};

const RESOURCE_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  appointments: { label: "المواعيد", icon: <Calendar className="h-4 w-4" /> },
  treatment_records: { label: "سجلات العلاج", icon: <Stethoscope className="h-4 w-4" /> },
  payments: { label: "الدفعات", icon: <CreditCard className="h-4 w-4" /> },
};

export function RolePermissionsManagement() {
  const queryClient = useQueryClient();
  const [selectedRole, setSelectedRole] = useState<AppRole>("doctor");

  const { data: permissions, isLoading } = useQuery({
    queryKey: ["role_permissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_permissions")
        .select("*")
        .order("role")
        .order("resource");
      
      if (error) throw error;
      return data as RolePermission[];
    },
  });

  const updatePermission = useMutation({
    mutationFn: async ({
      id,
      field,
      value,
    }: {
      id: string;
      field: "can_create" | "can_update" | "can_delete";
      value: boolean;
    }) => {
      const { error } = await supabase
        .from("role_permissions")
        .update({ [field]: value })
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role_permissions"] });
      toast({
        title: "تم التحديث",
        description: "تم تحديث الصلاحية بنجاح",
      });
    },
    onError: (error) => {
      toast({
        title: "خطأ",
        description: error instanceof Error ? error.message : "فشل في تحديث الصلاحية",
        variant: "destructive",
      });
    },
  });

  const rolePermissions = permissions?.filter((p) => p.role === selectedRole) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>إدارة صلاحيات الأدوار</CardTitle>
              <CardDescription>
                تحكم في صلاحيات كل دور للإضافة والتعديل والحذف
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Role Tabs */}
          <div className="flex flex-wrap gap-2 mb-6">
            {(Object.keys(ROLE_LABELS) as AppRole[]).map((role) => (
              <button
                key={role}
                onClick={() => setSelectedRole(role)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedRole === role
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/80 text-muted-foreground"
                }`}
              >
                {ROLE_LABELS[role]}
              </button>
            ))}
          </div>

          {/* Permissions Grid */}
          <div className="space-y-4">
            {Object.keys(RESOURCE_LABELS).map((resource) => {
              const permission = rolePermissions.find((p) => p.resource === resource);
              const resourceInfo = RESOURCE_LABELS[resource];
              
              if (!permission) return null;

              return (
                <Card key={resource} className="bg-muted/30">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-background rounded-lg">
                        {resourceInfo.icon}
                      </div>
                      <span className="font-medium">{resourceInfo.label}</span>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4">
                      <div className="flex items-center justify-between p-3 bg-background rounded-lg">
                        <Label htmlFor={`${resource}-create`} className="cursor-pointer">
                          إضافة
                        </Label>
                        <Switch
                          id={`${resource}-create`}
                          checked={permission.can_create}
                          onCheckedChange={(checked) =>
                            updatePermission.mutate({
                              id: permission.id,
                              field: "can_create",
                              value: checked,
                            })
                          }
                          disabled={selectedRole === "super_admin"}
                        />
                      </div>
                      
                      <div className="flex items-center justify-between p-3 bg-background rounded-lg">
                        <Label htmlFor={`${resource}-update`} className="cursor-pointer">
                          تعديل
                        </Label>
                        <Switch
                          id={`${resource}-update`}
                          checked={permission.can_update}
                          onCheckedChange={(checked) =>
                            updatePermission.mutate({
                              id: permission.id,
                              field: "can_update",
                              value: checked,
                            })
                          }
                          disabled={selectedRole === "super_admin"}
                        />
                      </div>
                      
                      <div className="flex items-center justify-between p-3 bg-background rounded-lg">
                        <Label htmlFor={`${resource}-delete`} className="cursor-pointer">
                          حذف
                        </Label>
                        <Switch
                          id={`${resource}-delete`}
                          checked={permission.can_delete}
                          onCheckedChange={(checked) =>
                            updatePermission.mutate({
                              id: permission.id,
                              field: "can_delete",
                              value: checked,
                            })
                          }
                          disabled={selectedRole === "super_admin"}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {selectedRole === "super_admin" && (
            <p className="text-sm text-muted-foreground mt-4 text-center">
              المدير العام لديه جميع الصلاحيات ولا يمكن تعديلها
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
