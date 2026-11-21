import { useState, useEffect } from "react";
import { AdminUser, adminApi, apiErrorMessage } from "@/api/clinic";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Shield, Users, Lock, UserPlus } from "lucide-react";
import { format } from "date-fns";

type UserProfile = AdminUser & { created_at?: string };

const emptyNewUser = { email: "", full_name: "", role: "receptionist", password: "" };

export function AdminUserManagement() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newUser, setNewUser] = useState(emptyNewUser);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setUsers(await adminApi.users());
    } catch (error) {
      toast({ title: "خطأ", description: apiErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Accounts are created here (there is no public sign-up any more).
  const handleCreateUser = async () => {
    try {
      await adminApi.createUser(newUser);
      toast({ title: "تم الإنشاء", description: "تم إنشاء المستخدم بنجاح" });
      setCreateDialogOpen(false);
      setNewUser(emptyNewUser);
      fetchUsers();
    } catch (error) {
      toast({ title: "خطأ", description: apiErrorMessage(error), variant: "destructive" });
    }
  };

  const handlePasswordUpdate = async () => {
    if (!selectedUser || !newPassword) return;

    try {
      await adminApi.resetPassword(selectedUser.id, newPassword);
      toast({ title: "تم التحديث", description: "تم تحديث كلمة المرور بنجاح" });
      setPasswordDialogOpen(false);
      setNewPassword("");
      setSelectedUser(null);
    } catch (error) {
      toast({ title: "خطأ", description: apiErrorMessage(error), variant: "destructive" });
    }
  };

  const handleRoleAssignment = async () => {
    if (!selectedUser || !selectedRole) return;

    try {
      await adminApi.updateUser(selectedUser.id, { role: selectedRole });
      toast({ title: "تم التحديث", description: "تم تعيين الدور بنجاح" });
      setRoleDialogOpen(false);
      setSelectedRole("");
      setSelectedUser(null);
      fetchUsers();
    } catch (error) {
      toast({ title: "خطأ", description: apiErrorMessage(error), variant: "destructive" });
    }
  };

  const toggleActive = async (user: UserProfile) => {
    try {
      await adminApi.updateUser(user.id, { is_active: !user.is_active });
      toast({ title: "تم التحديث", description: user.is_active ? "تم إيقاف الحساب" : "تم تفعيل الحساب" });
      fetchUsers();
    } catch (error) {
      toast({ title: "خطأ", description: apiErrorMessage(error), variant: "destructive" });
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'super_admin':
        return 'destructive';
      case 'doctor':
        return 'default';
      case 'dentist_assistant':
        return 'secondary';
      case 'receptionist':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'super_admin':
        return 'مدير عام';
      case 'doctor':
        return 'طبيب';
      case 'dentist_assistant':
        return 'مساعد طبيب الأسنان';
      case 'receptionist':
        return 'موظف استقبال';
      default:
        return 'لا يوجد دور';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>إدارة المستخدمين</CardTitle>
              <CardDescription>
                إدارة المستخدمين وتعيين الأدوار وتحديث كلمات المرور
              </CardDescription>
            </div>
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="mr-auto">
                  <UserPlus className="h-4 w-4 ml-1" />
                  مستخدم جديد
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>إنشاء مستخدم جديد</DialogTitle>
                  <DialogDescription>كلمة المرور 8 أحرف على الأقل. يمكن للمستخدم تغييرها لاحقاً.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="newUserName">الاسم الكامل</Label>
                    <Input id="newUserName" value={newUser.full_name} onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="newUserEmail">البريد الإلكتروني</Label>
                    <Input id="newUserEmail" type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
                  </div>
                  <div>
                    <Label>الدور</Label>
                    <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="doctor">طبيب</SelectItem>
                        <SelectItem value="dentist_assistant">مساعد طبيب الأسنان</SelectItem>
                        <SelectItem value="receptionist">موظف استقبال</SelectItem>
                        <SelectItem value="super_admin">مدير عام</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="newUserPassword">كلمة المرور</Label>
                    <Input id="newUserPassword" type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>إلغاء</Button>
                  <Button onClick={handleCreateUser}>إنشاء</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم</TableHead>
                <TableHead>البريد الإلكتروني</TableHead>
                <TableHead>الدور</TableHead>
                <TableHead>تاريخ الإنشاء</TableHead>
                <TableHead>الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.full_name || "غير محدد"}
                    {!user.is_active && <Badge variant="outline" className="mr-2">موقوف</Badge>}
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={getRoleBadgeVariant(user.role || '')}>
                      {getRoleDisplayName(user.role || '')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.created_at ? format(new Date(user.created_at), 'dd/MM/yyyy') : "-"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedUser(user)}
                          >
                            <Lock className="h-4 w-4 mr-1" />
                            كلمة المرور
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>تحديث كلمة المرور</DialogTitle>
                            <DialogDescription>
                              تحديث كلمة المرور للمستخدم: {selectedUser?.email}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div>
                              <Label htmlFor="newPassword">كلمة المرور الجديدة</Label>
                              <Input
                                id="newPassword"
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="أدخل كلمة المرور الجديدة"
                              />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button
                              variant="outline"
                              onClick={() => {
                                setPasswordDialogOpen(false);
                                setNewPassword("");
                                setSelectedUser(null);
                              }}
                            >
                              إلغاء
                            </Button>
                            <Button onClick={handlePasswordUpdate}>
                              تحديث كلمة المرور
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>

                      <Button variant="outline" size="sm" onClick={() => toggleActive(user)}>
                        {user.is_active ? "إيقاف" : "تفعيل"}
                      </Button>

                      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedUser(user)}
                          >
                            <Shield className="h-4 w-4 mr-1" />
                            تعيين دور
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>تعيين دور للمستخدم</DialogTitle>
                            <DialogDescription>
                              تعيين دور للمستخدم: {selectedUser?.email}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div>
                              <Label htmlFor="role">الدور</Label>
                              <Select value={selectedRole} onValueChange={setSelectedRole}>
                                <SelectTrigger>
                                  <SelectValue placeholder="اختر الدور" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="doctor">طبيب</SelectItem>
                                  <SelectItem value="dentist_assistant">مساعد طبيب الأسنان</SelectItem>
                                  <SelectItem value="receptionist">موظف استقبال</SelectItem>
                                  <SelectItem value="super_admin">مدير عام</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <DialogFooter>
                            <Button
                              variant="outline"
                              onClick={() => {
                                setRoleDialogOpen(false);
                                setSelectedRole("");
                                setSelectedUser(null);
                              }}
                            >
                              إلغاء
                            </Button>
                            <Button onClick={handleRoleAssignment}>
                              تعيين الدور
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}