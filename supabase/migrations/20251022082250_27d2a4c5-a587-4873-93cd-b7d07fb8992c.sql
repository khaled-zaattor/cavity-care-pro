-- Create treatment_plans table
CREATE TABLE public.treatment_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL,
  treatment_id UUID NOT NULL,
  sub_treatment_id UUID NOT NULL,
  tooth_number TEXT NOT NULL,
  is_executed BOOLEAN DEFAULT false,
  executed_at TIMESTAMP WITH TIME ZONE,
  appointment_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.treatment_plans ENABLE ROW LEVEL SECURITY;

-- Create policies for treatment_plans
CREATE POLICY "Medical staff can view treatment plans" 
ON public.treatment_plans 
FOR SELECT 
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'dentist_assistant'::app_role) OR 
  has_role(auth.uid(), 'receptionist'::app_role)
);

CREATE POLICY "Medical staff can create treatment plans" 
ON public.treatment_plans 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'dentist_assistant'::app_role)
);

CREATE POLICY "Medical staff can update treatment plans" 
ON public.treatment_plans 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'dentist_assistant'::app_role)
);

CREATE POLICY "Super admins can delete treatment plans" 
ON public.treatment_plans 
FOR DELETE 
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_treatment_plans_updated_at
BEFORE UPDATE ON public.treatment_plans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for activity logging
CREATE TRIGGER log_treatment_plans_activity
AFTER INSERT OR UPDATE OR DELETE ON public.treatment_plans
FOR EACH ROW
EXECUTE FUNCTION public.log_user_activity();