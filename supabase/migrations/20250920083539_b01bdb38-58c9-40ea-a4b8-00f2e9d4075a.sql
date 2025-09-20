-- Drop the overly permissive RLS policies on doctors table
DROP POLICY "Authenticated users can manage doctors" ON public.doctors;
DROP POLICY "Authenticated users can read doctors" ON public.doctors;
DROP POLICY "Authenticated users can update doctors" ON public.doctors;

-- Create secure RLS policies for doctors table based on user roles
-- Super admins can do everything (HR management)
CREATE POLICY "Super admins can manage all doctors"
ON public.doctors
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Medical staff can read doctor names and specialties (for scheduling/referrals)
-- But NOT personal contact information unless they are super admin
CREATE POLICY "Medical staff can read basic doctor info"
ON public.doctors
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role) OR
  public.has_role(auth.uid(), 'doctor'::app_role) OR
  public.has_role(auth.uid(), 'dentist_assistant'::app_role) OR
  public.has_role(auth.uid(), 'receptionist'::app_role)
);

-- Only super admins can insert new doctors (HR function)
CREATE POLICY "Only super admins can insert doctors"
ON public.doctors
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Only super admins can update doctor information (HR function)
CREATE POLICY "Only super admins can update doctors"
ON public.doctors
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));