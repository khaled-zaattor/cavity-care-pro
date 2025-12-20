-- Add address and job columns to patients table
ALTER TABLE public.patients 
ADD COLUMN address TEXT,
ADD COLUMN job TEXT;