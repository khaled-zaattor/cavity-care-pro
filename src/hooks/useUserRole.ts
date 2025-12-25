import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "super_admin" | "doctor" | "dentist_assistant" | "receptionist";

export function useUserRole() {
  const [userRole, setUserRole] = useState<AppRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkUserRole = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: roleData } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", session.user.id)
            .single();
          
          if (roleData?.role) {
            setUserRole(roleData.role as AppRole);
          }
        }
      } catch (error) {
        console.error("Error checking user role:", error);
      } finally {
        setIsLoading(false);
      }
    };

    checkUserRole();
  }, []);

  // Helper function to check if user can manage payments
  const canManagePayments = userRole !== "dentist_assistant";

  return { userRole, isLoading, canManagePayments };
}
