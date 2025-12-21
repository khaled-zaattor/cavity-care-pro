-- جدول صلاحيات الأدوار
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  resource text NOT NULL, -- 'appointments', 'treatment_records', 'payments'
  can_create boolean NOT NULL DEFAULT false,
  can_update boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (role, resource)
);

-- تفعيل RLS
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- سياسات الأمان - المدير العام فقط يمكنه الإدارة
CREATE POLICY "Super admins can manage role permissions"
ON public.role_permissions
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- جميع المستخدمين المصادق عليهم يمكنهم القراءة
CREATE POLICY "Authenticated users can view role permissions"
ON public.role_permissions
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- إدخال الصلاحيات الافتراضية
INSERT INTO public.role_permissions (role, resource, can_create, can_update, can_delete) VALUES
-- super_admin - كل الصلاحيات
('super_admin', 'appointments', true, true, true),
('super_admin', 'treatment_records', true, true, true),
('super_admin', 'payments', true, true, true),
-- doctor - كل الصلاحيات
('doctor', 'appointments', true, true, true),
('doctor', 'treatment_records', true, true, true),
('doctor', 'payments', true, true, true),
-- dentist_assistant - صلاحيات محدودة
('dentist_assistant', 'appointments', true, true, true),
('dentist_assistant', 'treatment_records', true, true, true),
('dentist_assistant', 'payments', true, true, false),
-- receptionist - صلاحيات محدودة
('receptionist', 'appointments', true, true, true),
('receptionist', 'treatment_records', false, false, false),
('receptionist', 'payments', true, true, false);

-- Trigger لتحديث updated_at
CREATE TRIGGER update_role_permissions_updated_at
BEFORE UPDATE ON public.role_permissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();