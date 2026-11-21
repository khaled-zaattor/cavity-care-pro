-- Rollback for migrations/20261119120000_independent_doctors.sql
-- Run in the Supabase SQL editor ONLY if you need to undo that migration.
-- WARNING: drops the new columns, so any doctor links / own-books flags /
-- treatment ownership / waiting-list doctor values entered since are lost.

-- Policies
DROP POLICY IF EXISTS "Books scope: appointments" ON public.appointments;
DROP POLICY IF EXISTS "Books scope: payments" ON public.payments;
DROP POLICY IF EXISTS "Books scope: treatment_records" ON public.treatment_records;
DROP POLICY IF EXISTS "Books scope: appointment_treatment_steps" ON public.appointment_treatment_steps;
DROP POLICY IF EXISTS "Books scope: treatment_plans" ON public.treatment_plans;
DO $$ BEGIN
  IF to_regclass('public.unfinished_sub_treatments') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Books scope: unfinished_sub_treatments" ON public.unfinished_sub_treatments';
  END IF;
END $$;
DROP POLICY IF EXISTS "Books scope: treatments" ON public.treatments;
DROP POLICY IF EXISTS "Books scope: sub_treatments" ON public.sub_treatments;
DROP POLICY IF EXISTS "Books scope: sub_treatment_steps" ON public.sub_treatment_steps;
DROP POLICY IF EXISTS "Books scope: activity_logs read" ON public.activity_logs;
DROP POLICY IF EXISTS "Independent doctors manage own treatments" ON public.treatments;
DROP POLICY IF EXISTS "Independent doctors manage own sub treatments" ON public.sub_treatments;
DROP POLICY IF EXISTS "Independent doctors manage own sub treatment steps" ON public.sub_treatment_steps;
DROP POLICY IF EXISTS "Doctors can read own row" ON public.doctors;

-- Functions
DROP FUNCTION IF EXISTS public.can_read_treatment_catalog(uuid);
DROP FUNCTION IF EXISTS public.sub_treatment_doctor_id(uuid);
DROP FUNCTION IF EXISTS public.treatment_doctor_id(uuid);
DROP FUNCTION IF EXISTS public.appointment_doctor_id(uuid);
DROP FUNCTION IF EXISTS public.can_see_doctor_schedule(uuid);
DROP FUNCTION IF EXISTS public.can_see_doctor_books(uuid);
DROP FUNCTION IF EXISTS public.is_independent_doctor();
DROP FUNCTION IF EXISTS public.current_doctor_id();

-- Restore original ON DELETE CASCADE on appointments.doctor_id
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_doctor_id_fkey;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_doctor_id_fkey
  FOREIGN KEY (doctor_id) REFERENCES public.doctors(id) ON DELETE CASCADE;

-- Columns / indexes
DROP INDEX IF EXISTS public.idx_appointments_doctor_id;
DROP INDEX IF EXISTS public.idx_treatments_doctor_id;
ALTER TABLE public.waiting_list DROP COLUMN IF EXISTS doctor_id;
ALTER TABLE public.treatments DROP COLUMN IF EXISTS doctor_id;
ALTER TABLE public.doctors DROP COLUMN IF EXISTS has_own_books;
ALTER TABLE public.doctors DROP COLUMN IF EXISTS user_id;
