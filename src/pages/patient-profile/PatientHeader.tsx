import type { Dispatch, SetStateAction } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Receipt } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import type { Patient } from "@/api/clinic";

interface PatientHeaderProps {
  patient: Patient;
  patientId: string;
  activeSection: string;
  setActiveSection: Dispatch<SetStateAction<string>>;
  handleExportPatientData: () => void;
}

/** Back button, patient name, export / statement buttons and the section switcher. */
export function PatientHeader({ patient, patientId, activeSection, setActiveSection, handleExportPatientData }: PatientHeaderProps) {
  const navigate = useNavigate();
  const { isSuperAdmin } = useUserRole();

  return (
    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
      <div className="flex items-center space-x-4 space-x-reverse">
        <Button variant="outline" onClick={() => navigate("/patients")}>
          <ArrowLeft className="ml-2 h-4 w-4" />
          العودة للمرضى
        </Button>
        <h1 className="text-2xl lg:text-3xl font-bold">{patient.full_name}</h1>
      </div>

      {/* Secondary Navigation Menu - Inline */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleExportPatientData}
        >
          <Download className="ml-2 h-4 w-4" />
          تصدير ملف المريض
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => window.open(`/print/statement/${patientId}`, "_blank")}
        >
          <Receipt className="ml-2 h-4 w-4" />
          كشف حساب
        </Button>
        <Button
          variant={activeSection === "all" ? "default" : "outline"}
          onClick={() => setActiveSection("all")}
          size="sm"
        >
          الكل
        </Button>
        <Button
          variant={activeSection === "appointments" ? "default" : "outline"}
          onClick={() => setActiveSection("appointments")}
          size="sm"
        >
          تاريخ المواعيد
        </Button>
        <Button
          variant={activeSection === "treatments" ? "default" : "outline"}
          onClick={() => setActiveSection("treatments")}
          size="sm"
        >
          جميع العلاجات
        </Button>
        <Button
          variant={activeSection === "payments" ? "default" : "outline"}
          onClick={() => setActiveSection("payments")}
          size="sm"
        >
          جميع المدفوعات
        </Button>
        <Button
          variant={activeSection === "prescriptions" ? "default" : "outline"}
          onClick={() => setActiveSection("prescriptions")}
          size="sm"
        >
          الوصفات
        </Button>
        <Button
          variant={activeSection === "files" ? "default" : "outline"}
          onClick={() => setActiveSection("files")}
          size="sm"
        >
          الملفات
        </Button>
        <Button
          variant={activeSection === "timeline" ? "default" : "outline"}
          onClick={() => setActiveSection("timeline")}
          size="sm"
        >
          السجل الطبي
        </Button>
        {isSuperAdmin && (
          <Button
            variant={activeSection === "history" ? "default" : "outline"}
            onClick={() => setActiveSection("history")}
            size="sm"
          >
            سجل التغييرات
          </Button>
        )}
      </div>
    </div>
  );
}
