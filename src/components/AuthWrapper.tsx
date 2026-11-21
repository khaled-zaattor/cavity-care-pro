import { createContext, useContext, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Shield, Lock } from "lucide-react";
import { CurrentUser, fetchCurrentUser, login, logout } from "@/api/auth";
import { apiErrorMessage } from "@/api/clinic";

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true, signOut: async () => {} });

export const useAuth = () => useContext(AuthContext);

interface AuthWrapperProps {
  children: React.ReactNode;
}

/**
 * Laravel session login (Sanctum cookie). Accounts are created by the admin
 * from إدارة النظام, so there is no public sign-up any more.
 */
export function AuthWrapper({ children }: AuthWrapperProps) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    fetchCurrentUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));

    const onExpired = () => {
      queryClient.clear();
      setUser(null);
    };
    window.addEventListener("auth:expired", onExpired);
    return () => window.removeEventListener("auth:expired", onExpired);
  }, [queryClient]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const u = await login(email, password);
      queryClient.clear();
      setUser(u);
      setPassword("");
      toast({ title: "تم تسجيل الدخول", description: "مرحباً بك في نظام إدارة العيادة" });
    } catch (error) {
      toast({ title: "خطأ", description: apiErrorMessage(error), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const signOut = async () => {
    try {
      await logout();
    } finally {
      queryClient.clear();
      setUser(null);
      toast({ title: "تم تسجيل الخروج", description: "تم تسجيل خروجك بنجاح" });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4" dir="rtl">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-2xl">تسجيل الدخول</CardTitle>
            <CardDescription>
              <span className="flex items-center justify-center gap-2 text-amber-600 bg-amber-50 p-2 rounded-md mt-2">
                <Lock className="h-4 w-4" />
                بيانات المرضى محمية - مطلوب تسجيل الدخول
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAuth} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="doctor@clinic.com" autoComplete="username" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">كلمة المرور</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" autoComplete="current-password" />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "جاري المعالجة..." : "تسجيل الدخول"}
              </Button>
              <p className="text-xs text-center text-muted-foreground">لإنشاء حساب جديد تواصل مع مدير النظام</p>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 print:hidden">
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-green-700">
              <Shield className="h-4 w-4" />
              <span className="text-sm font-medium">{user.full_name || user.email.replace(/@gmail\.com$/, "")}</span>
              <Button variant="ghost" size="sm" onClick={signOut} className="h-auto p-1 text-xs">
                خروج
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AuthContext.Provider>
  );
}
