-- Drop the overly permissive RLS policies on patients table
DROP POLICY "Authenticated users can read patients" ON public.patients;
DROP POLICY "Authenticated users can insert patients" ON public.patients;
DROP POLICY "Authenticated users can update patients" ON public.patients;

-- Create secure RLS policies for patients table based on user roles
-- Super admins can do everything
CREATE POLICY "Super admins can manage all patients"
ON public.patients
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Doctors and admins can read and update patients
CREATE POLICY "Doctors and admins can read patients"
ON public.patients
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role) OR
  public.has_role(auth.uid(), 'admin'::app_role) OR
  public.has_role(auth.uid(), 'doctor'::app_role)
);

CREATE POLICY "Doctors and admins can insert patients"
ON public.patients
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin'::app_role) OR
  public.has_role(auth.uid(), 'admin'::app_role) OR
  public.has_role(auth.uid(), 'doctor'::app_role)
);

CREATE POLICY "Doctors and admins can update patients"
ON public.patients
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role) OR
  public.has_role(auth.uid(), 'admin'::app_role) OR
  public.has_role(auth.uid(), 'doctor'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin'::app_role) OR
  public.has_role(auth.uid(), 'admin'::app_role) OR
  public.has_role(auth.uid(), 'doctor'::app_role)
);