-- Add foreign key constraint to establish relationship
ALTER TABLE public.sub_treatment_steps 
ADD CONSTRAINT fk_sub_treatment_steps_sub_treatment_id 
FOREIGN KEY (sub_treatment_id) REFERENCES public.sub_treatments(id) ON DELETE CASCADE;