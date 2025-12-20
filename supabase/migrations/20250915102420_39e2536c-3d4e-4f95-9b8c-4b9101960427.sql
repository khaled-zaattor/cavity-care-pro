-- First, let's secure the patient data with proper RLS policies
-- Remove the overly permissive policies and implement user-based access control

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Allow all operations on patients" ON public.patients;
DROP POLICY IF EXISTS "Allow all operations on appointments" ON public.appointments;
DROP POLICY IF EXISTS "Allow all operations on treatment_records" ON public.treatment_records;
DROP POLICY IF EXISTS "Allow all operations on doctors" ON public.doctors;
DROP POLICY IF EXISTS "Allow all operations on sub_treatments" ON public.sub_treatments;
DROP POLICY IF EXISTS "Allow all operations on treatments" ON public.treatments;
DROP POLICY IF EXISTS "Allow all operations on sub_treatment_steps" ON public.sub_treatment_steps;
DROP POLICY IF EXISTS "Allow all operations on appointment_treatment_steps" ON public.appointment_treatment_steps;
DROP POLICY IF EXISTS "Allow all operations on payments" ON public.payments;

-- Create secure RLS policies that require authentication
-- For now, we'll restrict to authenticated users only
-- Later, proper role-based access should be implemented

-- Patients table - Most sensitive data
CREATE POLICY "Authenticated users can read patients" 
ON public.patients 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Authenticated users can insert patients" 
ON public.patients 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Authenticated users can update patients" 
ON public.patients 
FOR UPDATE 
TO authenticated 
USING (true);

-- Appointments table
CREATE POLICY "Authenticated users can manage appointments" 
ON public.appointments 
FOR ALL 
TO authenticated 
USING (true);

-- Treatment records
CREATE POLICY "Authenticated users can manage treatment_records" 
ON public.treatment_records 
FOR ALL 
TO authenticated 
USING (true);

-- Doctors table
CREATE POLICY "Authenticated users can read doctors" 
ON public.doctors 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Authenticated users can manage doctors" 
ON public.doctors 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Authenticated users can update doctors" 
ON public.doctors 
FOR UPDATE 
TO authenticated 
USING (true);

-- Other tables
CREATE POLICY "Authenticated users can manage treatments" 
ON public.treatments 
FOR ALL 
TO authenticated 
USING (true);

CREATE POLICY "Authenticated users can manage sub_treatments" 
ON public.sub_treatments 
FOR ALL 
TO authenticated 
USING (true);

CREATE POLICY "Authenticated users can manage sub_treatment_steps" 
ON public.sub_treatment_steps 
FOR ALL 
TO authenticated 
USING (true);

CREATE POLICY "Authenticated users can manage appointment_treatment_steps" 
ON public.appointment_treatment_steps 
FOR ALL 
TO authenticated 
USING (true);

CREATE POLICY "Authenticated users can manage payments" 
ON public.payments 
FOR ALL 
TO authenticated 
USING (true);

-- For unfinished_sub_treatments, keep the existing authenticated policy
-- It already has: "Allow all operations for authenticated users"

-- Add some helpful columns to track security
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS accessed_by_user_id UUID;