-- Add estimated_cost column to sub_treatments table
ALTER TABLE public.sub_treatments 
ADD COLUMN estimated_cost NUMERIC;

-- Remove estimated_cost column from treatments table
ALTER TABLE public.treatments 
DROP COLUMN estimated_cost;