-- Create enum for waiting list status
CREATE TYPE waiting_list_status AS ENUM ('waiting', 'in_examination', 'completed');

-- Create waiting_list table
CREATE TABLE public.waiting_list (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  clinic_arrival_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  examination_room_entry_time TIMESTAMP WITH TIME ZONE,
  status waiting_list_status NOT NULL DEFAULT 'waiting',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.waiting_list ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Medical staff can view waiting list"
  ON public.waiting_list FOR SELECT
  USING (
    has_role(auth.uid(), 'super_admin'::app_role) OR 
    has_role(auth.uid(), 'doctor'::app_role) OR 
    has_role(auth.uid(), 'dentist_assistant'::app_role) OR 
    has_role(auth.uid(), 'receptionist'::app_role)
  );

CREATE POLICY "Medical staff can insert waiting list"
  ON public.waiting_list FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role) OR 
    has_role(auth.uid(), 'doctor'::app_role) OR 
    has_role(auth.uid(), 'dentist_assistant'::app_role) OR 
    has_role(auth.uid(), 'receptionist'::app_role)
  );

CREATE POLICY "Medical staff can update waiting list"
  ON public.waiting_list FOR UPDATE
  USING (
    has_role(auth.uid(), 'super_admin'::app_role) OR 
    has_role(auth.uid(), 'doctor'::app_role) OR 
    has_role(auth.uid(), 'dentist_assistant'::app_role) OR 
    has_role(auth.uid(), 'receptionist'::app_role)
  );

CREATE POLICY "Super admins can delete waiting list"
  ON public.waiting_list FOR DELETE
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_waiting_list_updated_at
  BEFORE UPDATE ON public.waiting_list
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for activity logging
CREATE TRIGGER log_waiting_list_activity
  AFTER INSERT OR UPDATE OR DELETE ON public.waiting_list
  FOR EACH ROW
  EXECUTE FUNCTION public.log_user_activity();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.waiting_list;