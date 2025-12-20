-- Create enum for appointment status
CREATE TYPE public.appointment_status AS ENUM ('Scheduled', 'Completed', 'Cancelled');

-- Create doctors table
CREATE TABLE public.doctors (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone_number TEXT NOT NULL,
    specialty TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create patients table
CREATE TABLE public.patients (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name TEXT NOT NULL,
    date_of_birth DATE NOT NULL,
    phone_number TEXT NOT NULL,
    contact TEXT,
    medical_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create treatments table
CREATE TABLE public.treatments (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    estimated_cost DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create sub_treatments table
CREATE TABLE public.sub_treatments (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    treatment_id UUID NOT NULL REFERENCES public.treatments(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create appointments table
CREATE TABLE public.appointments (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status appointment_status NOT NULL DEFAULT 'Scheduled',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create treatment_records table
CREATE TABLE public.treatment_records (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
    treatment_id UUID NOT NULL REFERENCES public.treatments(id) ON DELETE CASCADE,
    sub_treatment_id UUID NOT NULL REFERENCES public.sub_treatments(id) ON DELETE CASCADE,
    tooth_number TEXT NOT NULL,
    performed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create payments table
CREATE TABLE public.payments (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    paid_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security for all tables
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_treatments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (allowing all operations for now - can be refined later)
CREATE POLICY "Allow all operations on doctors" ON public.doctors FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on patients" ON public.patients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on treatments" ON public.treatments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on sub_treatments" ON public.sub_treatments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on appointments" ON public.appointments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on treatment_records" ON public.treatment_records FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on payments" ON public.payments FOR ALL USING (true) WITH CHECK (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_doctors_updated_at BEFORE UPDATE ON public.doctors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_treatments_updated_at BEFORE UPDATE ON public.treatments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sub_treatments_updated_at BEFORE UPDATE ON public.sub_treatments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_treatment_records_updated_at BEFORE UPDATE ON public.treatment_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert sample data
INSERT INTO public.doctors (full_name, email, phone_number, specialty) VALUES
('Dr. John Smith', 'john.smith@dentist.com', '+1234567890', 'General Dentistry'),
('Dr. Sarah Johnson', 'sarah.johnson@dentist.com', '+1234567891', 'Orthodontics'),
('Dr. Michael Brown', 'michael.brown@dentist.com', '+1234567892', 'Oral Surgery');

INSERT INTO public.treatments (name, description, estimated_cost) VALUES
('Dental Cleaning', 'Regular dental cleaning and checkup', 150.00),
('Root Canal', 'Root canal therapy for infected tooth', 800.00),
('Tooth Extraction', 'Simple or surgical tooth extraction', 300.00),
('Dental Filling', 'Composite or amalgam filling', 200.00),
('Crown Placement', 'Dental crown installation', 1200.00);

INSERT INTO public.sub_treatments (treatment_id, name) VALUES
((SELECT id FROM public.treatments WHERE name = 'Dental Cleaning'), 'Scaling'),
((SELECT id FROM public.treatments WHERE name = 'Dental Cleaning'), 'Polishing'),
((SELECT id FROM public.treatments WHERE name = 'Dental Cleaning'), 'Fluoride Treatment'),
((SELECT id FROM public.treatments WHERE name = 'Root Canal'), 'Pulp Removal'),
((SELECT id FROM public.treatments WHERE name = 'Root Canal'), 'Canal Cleaning'),
((SELECT id FROM public.treatments WHERE name = 'Root Canal'), 'Filling and Sealing'),
((SELECT id FROM public.treatments WHERE name = 'Tooth Extraction'), 'Local Anesthesia'),
((SELECT id FROM public.treatments WHERE name = 'Tooth Extraction'), 'Extraction'),
((SELECT id FROM public.treatments WHERE name = 'Tooth Extraction'), 'Suturing'),
((SELECT id FROM public.treatments WHERE name = 'Dental Filling'), 'Cavity Preparation'),
((SELECT id FROM public.treatments WHERE name = 'Dental Filling'), 'Filling Placement'),
((SELECT id FROM public.treatments WHERE name = 'Crown Placement'), 'Tooth Preparation'),
((SELECT id FROM public.treatments WHERE name = 'Crown Placement'), 'Impression Taking'),
((SELECT id FROM public.treatments WHERE name = 'Crown Placement'), 'Crown Fitting');