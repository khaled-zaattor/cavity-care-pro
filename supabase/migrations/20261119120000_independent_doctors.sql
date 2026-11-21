-- =====================================================================
-- Independent doctors ("own books"), e.g. a children's doctor.
--
-- A doctor with has_own_books = true:
--   * has a login (doctors.user_id) and only sees their OWN appointments,
--     treatment records, payments, plans and treatment catalog
--   * shares patients and the waiting room with the clinic
-- Clinic doctors / assistants do NOT see an independent doctor's
-- appointments, money or catalog. Receptionists can see their appointments
-- (to link waiting-room arrivals) but not their money. super_admin sees all.
--
-- Implementation: existing role-based (PERMISSIVE) policies are left as-is.
-- We add RESTRICTIVE policies that are AND-ed with them, so nothing changes
-- for the clinic until a doctor is flagged has_own_books = true.
--
-- Safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------
ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS has_own_books boolean NOT NULL DEFAULT false;

-- NULL = clinic catalog; set = that doctor's private catalog
ALTER TABLE public.treatments
  ADD COLUMN IF NOT EXISTS doctor_id uuid REFERENCES public.doctors(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_treatments_doctor_id ON public.treatments(doctor_id);

-- Which doctor the patient is waiting for (shared room, informational)
ALTER TABLE public.waiting_list
  ADD COLUMN IF NOT EXISTS doctor_id uuid REFERENCES public.doctors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_doctor_id ON public.appointments(doctor_id);

-- ---------------------------------------------------------------------
-- 2. Deleting a doctor must not wipe their appointments / money history
--    (was ON DELETE CASCADE)
-- ---------------------------------------------------------------------
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
    WHERE con.conrelid = 'public.appointments'::regclass
      AND con.contype = 'f'
      AND con.confrelid = 'public.doctors'::regclass
      AND att.attname = 'doctor_id'
  LOOP
    EXECUTE format('ALTER TABLE public.appointments DROP CONSTRAINT %I', c.conname);
  END LOOP;

  ALTER TABLE public.appointments
    ADD CONSTRAINT appointments_doctor_id_fkey
    FOREIGN KEY (doctor_id) REFERENCES public.doctors(id) ON DELETE RESTRICT;
END $$;

-- ---------------------------------------------------------------------
-- 3. Helper functions (SECURITY DEFINER so they bypass RLS internally)
-- ---------------------------------------------------------------------

-- doctors.id linked to the logged-in user (NULL if none)
CREATE OR REPLACE FUNCTION public.current_doctor_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.doctors WHERE user_id = auth.uid() LIMIT 1
$$;

-- Is the logged-in user an independent ("own books") doctor?
CREATE OR REPLACE FUNCTION public.is_independent_doctor()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.doctors WHERE user_id = auth.uid() AND has_own_books
  )
$$;

-- Can the logged-in user see the books (money, records, catalog) of doctor _doc?
-- _doc NULL means "clinic" (e.g. clinic treatment catalog).
CREATE OR REPLACE FUNCTION public.can_see_doctor_books(_doc uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (_doc IS NOT NULL AND _doc = public.current_doctor_id())
    OR (
      NOT public.is_independent_doctor()
      AND (
        _doc IS NULL
        OR NOT EXISTS (SELECT 1 FROM public.doctors d WHERE d.id = _doc AND d.has_own_books)
      )
    )
$$;

-- Schedule visibility (appointments): same as books, plus receptionists may
-- see every doctor's appointments (needed for the shared waiting room).
CREATE OR REPLACE FUNCTION public.can_see_doctor_schedule(_doc uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.can_see_doctor_books(_doc)
      OR public.has_role(auth.uid(), 'receptionist'::app_role)
$$;

-- Doctor of an appointment (bypasses RLS; avoids recursive policy lookups)
CREATE OR REPLACE FUNCTION public.appointment_doctor_id(_appointment_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT doctor_id FROM public.appointments WHERE id = _appointment_id
$$;

-- Owner doctor of a treatment (NULL = clinic catalog)
CREATE OR REPLACE FUNCTION public.treatment_doctor_id(_treatment_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT doctor_id FROM public.treatments WHERE id = _treatment_id
$$;

CREATE OR REPLACE FUNCTION public.sub_treatment_doctor_id(_sub_treatment_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT t.doctor_id
  FROM public.sub_treatments s JOIN public.treatments t ON t.id = s.treatment_id
  WHERE s.id = _sub_treatment_id
$$;

-- Catalog read access: own books, or receptionist (read-only, for display)
CREATE OR REPLACE FUNCTION public.can_read_treatment_catalog(_doc uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.can_see_doctor_books(_doc)
      OR public.has_role(auth.uid(), 'receptionist'::app_role)
$$;

GRANT EXECUTE ON FUNCTION
  public.current_doctor_id(), public.is_independent_doctor(),
  public.can_see_doctor_books(uuid), public.can_see_doctor_schedule(uuid),
  public.appointment_doctor_id(uuid), public.treatment_doctor_id(uuid),
  public.sub_treatment_doctor_id(uuid), public.can_read_treatment_catalog(uuid)
TO authenticated;

-- ---------------------------------------------------------------------
-- 4. RESTRICTIVE policies (AND-ed with the existing role policies)
-- ---------------------------------------------------------------------

-- appointments: schedule scope
DROP POLICY IF EXISTS "Books scope: appointments" ON public.appointments;
CREATE POLICY "Books scope: appointments" ON public.appointments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.can_see_doctor_schedule(doctor_id))
  WITH CHECK (public.can_see_doctor_schedule(doctor_id));

-- payments: books scope via appointment
DROP POLICY IF EXISTS "Books scope: payments" ON public.payments;
CREATE POLICY "Books scope: payments" ON public.payments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.can_see_doctor_books(public.appointment_doctor_id(appointment_id)))
  WITH CHECK (public.can_see_doctor_books(public.appointment_doctor_id(appointment_id)));

-- treatment_records: books scope via appointment
DROP POLICY IF EXISTS "Books scope: treatment_records" ON public.treatment_records;
CREATE POLICY "Books scope: treatment_records" ON public.treatment_records
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.can_see_doctor_books(public.appointment_doctor_id(appointment_id)))
  WITH CHECK (public.can_see_doctor_books(public.appointment_doctor_id(appointment_id)));

-- appointment_treatment_steps: books scope via appointment
DROP POLICY IF EXISTS "Books scope: appointment_treatment_steps" ON public.appointment_treatment_steps;
CREATE POLICY "Books scope: appointment_treatment_steps" ON public.appointment_treatment_steps
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.can_see_doctor_books(public.appointment_doctor_id(appointment_id)))
  WITH CHECK (public.can_see_doctor_books(public.appointment_doctor_id(appointment_id)));

-- treatment_plans: scoped by the treatment's catalog owner
DROP POLICY IF EXISTS "Books scope: treatment_plans" ON public.treatment_plans;
CREATE POLICY "Books scope: treatment_plans" ON public.treatment_plans
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.can_see_doctor_books(public.treatment_doctor_id(treatment_id)))
  WITH CHECK (public.can_see_doctor_books(public.treatment_doctor_id(treatment_id)));

-- unfinished_sub_treatments: scoped by the treatment's catalog owner
-- (only if it is a real table in this database)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'unfinished_sub_treatments' AND c.relkind = 'r'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "Books scope: unfinished_sub_treatments" ON public.unfinished_sub_treatments';
    EXECUTE $p$
      CREATE POLICY "Books scope: unfinished_sub_treatments" ON public.unfinished_sub_treatments
        AS RESTRICTIVE FOR ALL TO authenticated
        USING (public.can_see_doctor_books(public.treatment_doctor_id(treatment_id)))
        WITH CHECK (public.can_see_doctor_books(public.treatment_doctor_id(treatment_id)))
    $p$;
  END IF;
END $$;

-- Treatment catalog: read scope
DROP POLICY IF EXISTS "Books scope: treatments" ON public.treatments;
CREATE POLICY "Books scope: treatments" ON public.treatments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.can_read_treatment_catalog(doctor_id))
  WITH CHECK (public.can_see_doctor_books(doctor_id));

DROP POLICY IF EXISTS "Books scope: sub_treatments" ON public.sub_treatments;
CREATE POLICY "Books scope: sub_treatments" ON public.sub_treatments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.can_read_treatment_catalog(public.treatment_doctor_id(treatment_id)))
  WITH CHECK (public.can_see_doctor_books(public.treatment_doctor_id(treatment_id)));

DROP POLICY IF EXISTS "Books scope: sub_treatment_steps" ON public.sub_treatment_steps;
CREATE POLICY "Books scope: sub_treatment_steps" ON public.sub_treatment_steps
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.can_read_treatment_catalog(public.sub_treatment_doctor_id(sub_treatment_id)))
  WITH CHECK (public.can_see_doctor_books(public.sub_treatment_doctor_id(sub_treatment_id)));

-- Activity logs contain amounts from every doctor: super_admin only
DROP POLICY IF EXISTS "Books scope: activity_logs read" ON public.activity_logs;
CREATE POLICY "Books scope: activity_logs read" ON public.activity_logs
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- ---------------------------------------------------------------------
-- 5. PERMISSIVE policies: let an independent doctor manage their OWN catalog
--    (existing policies only allow super_admin to write the catalog)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Independent doctors manage own treatments" ON public.treatments;
CREATE POLICY "Independent doctors manage own treatments" ON public.treatments
  FOR ALL TO authenticated
  USING (public.is_independent_doctor() AND doctor_id = public.current_doctor_id())
  WITH CHECK (public.is_independent_doctor() AND doctor_id = public.current_doctor_id());

DROP POLICY IF EXISTS "Independent doctors manage own sub treatments" ON public.sub_treatments;
CREATE POLICY "Independent doctors manage own sub treatments" ON public.sub_treatments
  FOR ALL TO authenticated
  USING (public.is_independent_doctor() AND public.treatment_doctor_id(treatment_id) = public.current_doctor_id())
  WITH CHECK (public.is_independent_doctor() AND public.treatment_doctor_id(treatment_id) = public.current_doctor_id());

DROP POLICY IF EXISTS "Independent doctors manage own sub treatment steps" ON public.sub_treatment_steps;
CREATE POLICY "Independent doctors manage own sub treatment steps" ON public.sub_treatment_steps
  FOR ALL TO authenticated
  USING (public.is_independent_doctor() AND public.sub_treatment_doctor_id(sub_treatment_id) = public.current_doctor_id())
  WITH CHECK (public.is_independent_doctor() AND public.sub_treatment_doctor_id(sub_treatment_id) = public.current_doctor_id());

-- An independent doctor can read their own doctors row (already allowed for
-- the 'doctor' role, kept explicit in case the role policy changes).
DROP POLICY IF EXISTS "Doctors can read own row" ON public.doctors;
CREATE POLICY "Doctors can read own row" ON public.doctors
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- super_admin needs to list users with the doctor role when linking logins:
-- profiles are already readable by super_admin ("Super admins can manage all profiles").
