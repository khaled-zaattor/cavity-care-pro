-- Add currency column to payments table
ALTER TABLE public.payments 
ADD COLUMN currency text NOT NULL DEFAULT 'SYP';

-- Rename actual_cost to actual_cost_syp in treatment_records
ALTER TABLE public.treatment_records 
RENAME COLUMN actual_cost TO actual_cost_syp;

-- Add actual_cost_usd column to treatment_records
ALTER TABLE public.treatment_records 
ADD COLUMN actual_cost_usd numeric DEFAULT 0;

-- Rename estimated_cost to estimated_cost_syp in sub_treatments
ALTER TABLE public.sub_treatments 
RENAME COLUMN estimated_cost TO estimated_cost_syp;

-- Add estimated_cost_usd column to sub_treatments
ALTER TABLE public.sub_treatments 
ADD COLUMN estimated_cost_usd numeric DEFAULT 0;