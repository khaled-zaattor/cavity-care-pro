-- Fix critical security vulnerability: Secure treatment data access
-- Drop overly permissive policies that allow all authenticated users access

-- Drop existing permissive policies for treatments table
DROP POLICY IF EXISTS "Authenticated users can manage treatments" ON public.treatments;

-- Create secure role-based policies for treatments
CREATE POLICY "Super admins can manage all treatments" 
ON public.treatments 
FOR ALL 
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Medical staff can view treatments" 
ON public.treatments 
FOR SELECT 
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'dentist_assistant'::app_role) OR 
  has_role(auth.uid(), 'receptionist'::app_role)
);

-- Drop existing permissive policies for sub_treatments table
DROP POLICY IF EXISTS "Authenticated users can manage sub_treatments" ON public.sub_treatments;

-- Create secure role-based policies for sub_treatments
CREATE POLICY "Super admins can manage all sub treatments" 
ON public.sub_treatments 
FOR ALL 
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Medical staff can view sub treatments" 
ON public.sub_treatments 
FOR SELECT 
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'dentist_assistant'::app_role) OR 
  has_role(auth.uid(), 'receptionist'::app_role)
);

-- Drop existing permissive policies for sub_treatment_steps table
DROP POLICY IF EXISTS "Authenticated users can manage sub_treatment_steps" ON public.sub_treatment_steps;

-- Create secure role-based policies for sub_treatment_steps
CREATE POLICY "Super admins can manage all sub treatment steps" 
ON public.sub_treatment_steps 
FOR ALL 
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Medical staff can view sub treatment steps" 
ON public.sub_treatment_steps 
FOR SELECT 
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'dentist_assistant'::app_role) OR 
  has_role(auth.uid(), 'receptionist'::app_role)
);

-- Fix database function security: Add proper search_path to existing functions
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email)
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;