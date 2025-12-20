-- Update RLS policies to allow doctors to delete treatment records
DROP POLICY IF EXISTS "Super admins can delete treatment records" ON public.treatment_records;
CREATE POLICY "Medical staff can delete treatment records"
ON public.treatment_records
FOR DELETE
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'dentist_assistant'::app_role)
);

-- Update RLS policies to allow doctors to delete treatment plans
DROP POLICY IF EXISTS "Super admins can delete treatment plans" ON public.treatment_plans;
CREATE POLICY "Medical staff can delete treatment plans"
ON public.treatment_plans
FOR DELETE
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'dentist_assistant'::app_role)
);

-- Update RLS policies to allow doctors to delete payments
DROP POLICY IF EXISTS "Super admins can delete payments" ON public.payments;
CREATE POLICY "Medical staff can delete payments"
ON public.payments
FOR DELETE
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'dentist_assistant'::app_role)
);

-- Update RLS policies to allow doctors to delete appointments
DROP POLICY IF EXISTS "Super admins can delete appointments" ON public.appointments;
CREATE POLICY "Medical staff can delete appointments"
ON public.appointments
FOR DELETE
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'dentist_assistant'::app_role) OR 
  has_role(auth.uid(), 'receptionist'::app_role)
);

-- Update RLS policies to allow doctors to delete unfinished sub treatments
DROP POLICY IF EXISTS "Super admins can delete unfinished sub treatments" ON public.unfinished_sub_treatments;
CREATE POLICY "Medical staff can delete unfinished sub treatments"
ON public.unfinished_sub_treatments
FOR DELETE
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'dentist_assistant'::app_role)
);

-- Update RLS policies to allow doctors to delete appointment treatment steps
DROP POLICY IF EXISTS "Super admins can delete appointment treatment steps" ON public.appointment_treatment_steps;
CREATE POLICY "Medical staff can delete appointment treatment steps"
ON public.appointment_treatment_steps
FOR DELETE
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'dentist_assistant'::app_role)
);