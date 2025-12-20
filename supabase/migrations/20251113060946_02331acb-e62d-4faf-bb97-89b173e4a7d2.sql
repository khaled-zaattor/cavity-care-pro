-- Add treatment_notes column to treatment_records table
ALTER TABLE public.treatment_records
ADD COLUMN treatment_notes TEXT;