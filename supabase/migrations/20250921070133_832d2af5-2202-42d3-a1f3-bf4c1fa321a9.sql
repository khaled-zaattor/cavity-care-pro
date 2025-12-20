-- Fix security vulnerability: Restrict medical records access to authorized medical staff only

-- Drop overly permissive policies for appointments table
DROP POLICY IF EXISTS "Authenticated users can manage appointments" ON public.appointments;

-- Create secure role-based policies for appointments
CREATE POLICY "Medical staff can view appointments" 
ON public.appointments 
FOR SELECT 
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'dentist_assistant'::app_role) OR 
  has_role(auth.uid(), 'receptionist'::app_role)
);

CREATE POLICY "Medical staff can create appointments" 
ON public.appointments 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'dentist_assistant'::app_role) OR 
  has_role(auth.uid(), 'receptionist'::app_role)
);

CREATE POLICY "Medical staff can update appointments" 
ON public.appointments 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'dentist_assistant'::app_role) OR 
  has_role(auth.uid(), 'receptionist'::app_role)
);

CREATE POLICY "Super admins can delete appointments" 
ON public.appointments 
FOR DELETE 
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Drop overly permissive policies for payments table
DROP POLICY IF EXISTS "Authenticated users can manage payments" ON public.payments;

-- Create secure role-based policies for payments
CREATE POLICY "Medical staff can view payments" 
ON public.payments 
FOR SELECT 
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'dentist_assistant'::app_role) OR 
  has_role(auth.uid(), 'receptionist'::app_role)
);

CREATE POLICY "Medical staff can create payments" 
ON public.payments 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'dentist_assistant'::app_role) OR 
  has_role(auth.uid(), 'receptionist'::app_role)
);

CREATE POLICY "Medical staff can update payments" 
ON public.payments 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'dentist_assistant'::app_role) OR 
  has_role(auth.uid(), 'receptionist'::app_role)
);

CREATE POLICY "Super admins can delete payments" 
ON public.payments 
FOR DELETE 
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Drop overly permissive policies for treatment_records table
DROP POLICY IF EXISTS "Authenticated users can manage treatment_records" ON public.treatment_records;

-- Create secure role-based policies for treatment_records
CREATE POLICY "Medical staff can view treatment records" 
ON public.treatment_records 
FOR SELECT 
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'dentist_assistant'::app_role) OR 
  has_role(auth.uid(), 'receptionist'::app_role)
);

CREATE POLICY "Medical staff can create treatment records" 
ON public.treatment_records 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'dentist_assistant'::app_role)
);

CREATE POLICY "Medical staff can update treatment records" 
ON public.treatment_records 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'dentist_assistant'::app_role)
);

CREATE POLICY "Super admins can delete treatment records" 
ON public.treatment_records 
FOR DELETE 
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Drop overly permissive policies for unfinished_sub_treatments table
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.unfinished_sub_treatments;

-- Create secure role-based policies for unfinished_sub_treatments
CREATE POLICY "Medical staff can view unfinished sub treatments" 
ON public.unfinished_sub_treatments 
FOR SELECT 
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'dentist_assistant'::app_role) OR 
  has_role(auth.uid(), 'receptionist'::app_role)
);

CREATE POLICY "Medical staff can create unfinished sub treatments" 
ON public.unfinished_sub_treatments 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'dentist_assistant'::app_role)
);

CREATE POLICY "Medical staff can update unfinished sub treatments" 
ON public.unfinished_sub_treatments 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'dentist_assistant'::app_role)
);

CREATE POLICY "Super admins can delete unfinished sub treatments" 
ON public.unfinished_sub_treatments 
FOR DELETE 
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Also secure appointment_treatment_steps table
DROP POLICY IF EXISTS "Authenticated users can manage appointment_treatment_steps" ON public.appointment_treatment_steps;

-- Create secure role-based policies for appointment_treatment_steps
CREATE POLICY "Medical staff can view appointment treatment steps" 
ON public.appointment_treatment_steps 
FOR SELECT 
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'dentist_assistant'::app_role) OR 
  has_role(auth.uid(), 'receptionist'::app_role)
);

CREATE POLICY "Medical staff can create appointment treatment steps" 
ON public.appointment_treatment_steps 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'dentist_assistant'::app_role)
);

CREATE POLICY "Medical staff can update appointment treatment steps" 
ON public.appointment_treatment_steps 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'dentist_assistant'::app_role)
);

CREATE POLICY "Super admins can delete appointment treatment steps" 
ON public.appointment_treatment_steps 
FOR DELETE 
USING (has_role(auth.uid(), 'super_admin'::app_role));