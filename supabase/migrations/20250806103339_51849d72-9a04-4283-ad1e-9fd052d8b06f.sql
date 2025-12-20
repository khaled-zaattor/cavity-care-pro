-- Create a table for sub-treatment steps
CREATE TABLE public.sub_treatment_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sub_treatment_id UUID NOT NULL,
  step_name TEXT NOT NULL,
  step_description TEXT,
  step_order INTEGER NOT NULL DEFAULT 1,
  completion_percentage NUMERIC DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.sub_treatment_steps ENABLE ROW LEVEL SECURITY;

-- Create policy for sub_treatment_steps
CREATE POLICY "Allow all operations on sub_treatment_steps" 
ON public.sub_treatment_steps 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_sub_treatment_steps_updated_at
BEFORE UPDATE ON public.sub_treatment_steps
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();