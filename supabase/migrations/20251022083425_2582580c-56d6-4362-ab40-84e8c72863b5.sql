-- Add foreign keys to treatment_plans table
ALTER TABLE public.treatment_plans
ADD CONSTRAINT fk_treatment_plans_treatment
FOREIGN KEY (treatment_id) REFERENCES public.treatments(id) ON DELETE CASCADE;

ALTER TABLE public.treatment_plans
ADD CONSTRAINT fk_treatment_plans_sub_treatment
FOREIGN KEY (sub_treatment_id) REFERENCES public.sub_treatments(id) ON DELETE CASCADE;

ALTER TABLE public.treatment_plans
ADD CONSTRAINT fk_treatment_plans_patient
FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;

ALTER TABLE public.treatment_plans
ADD CONSTRAINT fk_treatment_plans_appointment
FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE SET NULL;