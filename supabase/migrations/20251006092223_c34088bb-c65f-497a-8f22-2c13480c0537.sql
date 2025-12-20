-- Create function to log user activities automatically
CREATE OR REPLACE FUNCTION public.log_user_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email TEXT;
  user_full_name TEXT;
  action_type TEXT;
  entity_name TEXT;
  old_data JSONB;
  new_data JSONB;
BEGIN
  -- Only log if there's an authenticated user (not system operations)
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Get user information
  SELECT email INTO user_email FROM auth.users WHERE id = auth.uid();
  SELECT full_name INTO user_full_name FROM public.profiles WHERE id = auth.uid();

  -- Determine action type
  IF TG_OP = 'INSERT' THEN
    action_type := 'إضافة';
    new_data := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    action_type := 'تعديل';
    old_data := to_jsonb(OLD);
    new_data := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    action_type := 'حذف';
    old_data := to_jsonb(OLD);
  END IF;

  -- Get entity name based on table
  CASE TG_TABLE_NAME
    WHEN 'patients' THEN entity_name := 'مريض';
    WHEN 'doctors' THEN entity_name := 'طبيب';
    WHEN 'appointments' THEN entity_name := 'موعد';
    WHEN 'treatment_records' THEN entity_name := 'سجل علاج';
    WHEN 'payments' THEN entity_name := 'دفعة';
    WHEN 'treatments' THEN entity_name := 'علاج';
    WHEN 'sub_treatments' THEN entity_name := 'علاج فرعي';
    WHEN 'unfinished_sub_treatments' THEN entity_name := 'علاج غير مكتمل';
    ELSE entity_name := TG_TABLE_NAME;
  END CASE;

  -- Insert activity log
  INSERT INTO public.activity_logs (
    user_id,
    user_name,
    action,
    entity_type,
    entity_id,
    details
  ) VALUES (
    auth.uid(),
    COALESCE(user_full_name, user_email, 'مستخدم غير معروف'),
    action_type || ' ' || entity_name,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    jsonb_build_object(
      'operation', TG_OP,
      'old_data', old_data,
      'new_data', new_data
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create triggers for all important tables

-- Patients table
CREATE TRIGGER log_patients_activity
AFTER INSERT OR UPDATE OR DELETE ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.log_user_activity();

-- Doctors table
CREATE TRIGGER log_doctors_activity
AFTER INSERT OR UPDATE OR DELETE ON public.doctors
FOR EACH ROW EXECUTE FUNCTION public.log_user_activity();

-- Appointments table
CREATE TRIGGER log_appointments_activity
AFTER INSERT OR UPDATE OR DELETE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.log_user_activity();

-- Treatment records table
CREATE TRIGGER log_treatment_records_activity
AFTER INSERT OR UPDATE OR DELETE ON public.treatment_records
FOR EACH ROW EXECUTE FUNCTION public.log_user_activity();

-- Payments table
CREATE TRIGGER log_payments_activity
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.log_user_activity();

-- Treatments table
CREATE TRIGGER log_treatments_activity
AFTER INSERT OR UPDATE OR DELETE ON public.treatments
FOR EACH ROW EXECUTE FUNCTION public.log_user_activity();

-- Sub treatments table
CREATE TRIGGER log_sub_treatments_activity
AFTER INSERT OR UPDATE OR DELETE ON public.sub_treatments
FOR EACH ROW EXECUTE FUNCTION public.log_user_activity();

-- Unfinished sub treatments table
CREATE TRIGGER log_unfinished_sub_treatments_activity
AFTER INSERT OR UPDATE OR DELETE ON public.unfinished_sub_treatments
FOR EACH ROW EXECUTE FUNCTION public.log_user_activity();