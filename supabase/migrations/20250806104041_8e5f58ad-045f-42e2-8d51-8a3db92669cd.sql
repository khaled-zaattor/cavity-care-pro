-- Create a table to track completed treatment steps in appointments
CREATE TABLE public.appointment_treatment_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id UUID NOT NULL,
  sub_treatment_step_id UUID NOT NULL,
  is_completed BOOLEAN DEFAULT FALSE,
  notes TEXT,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(appointment_id, sub_treatment_step_id)
);

-- Enable Row Level Security
ALTER TABLE public.appointment_treatment_steps ENABLE ROW LEVEL SECURITY;

-- Create policy for appointment_treatment_steps
CREATE POLICY "Allow all operations on appointment_treatment_steps" 
ON public.appointment_treatment_steps 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Add foreign key constraints
ALTER TABLE public.appointment_treatment_steps 
ADD CONSTRAINT fk_appointment_treatment_steps_appointment_id 
FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE;

ALTER TABLE public.appointment_treatment_steps 
ADD CONSTRAINT fk_appointment_treatment_steps_sub_treatment_step_id 
FOREIGN KEY (sub_treatment_step_id) REFERENCES public.sub_treatment_steps(id) ON DELETE CASCADE;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_appointment_treatment_steps_updated_at
BEFORE UPDATE ON public.appointment_treatment_steps
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();