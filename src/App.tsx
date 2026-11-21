import { DirectionProvider } from "@radix-ui/react-direction";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { AuthWrapper } from "@/components/AuthWrapper";
import Index from "./pages/Index";
import Patients from "./pages/Patients";
import PatientProfile from "./pages/PatientProfile";
import Doctors from "./pages/Doctors";
import DoctorProfile from "./pages/DoctorProfile";
import Appointments from "./pages/Appointments";
import Treatments from "./pages/Treatments";
import ActivityLogs from "./pages/ActivityLogs";
import AdminDashboard from "./pages/AdminDashboard";
import WaitingListDisplay from "./pages/WaitingListDisplay";
import WaitingListManagement from "./pages/WaitingListManagement";
import MyFinances from "./pages/MyFinances";
import Specialties from "./pages/Specialties";
import Reports from "./pages/Reports";
import Medicines from "./pages/Medicines";
import PrintPrescription from "./pages/PrintPrescription";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    // Don't hammer the API with retries on 401/403/422.
    queries: { retry: (count, error) => count < 2 && !(error as { status?: number })?.status, refetchOnWindowFocus: false },
  },
});

const App = () => (
  // Radix reads direction from context, not the DOM: without this, menus,
  // selects and switches behave LTR even though <html dir="rtl">.
  <DirectionProvider dir="rtl">
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthWrapper>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/patients" element={<Layout><Patients /></Layout>} />
            <Route path="/patient-profile/:patientId" element={<Layout><PatientProfile /></Layout>} />
            <Route path="/doctors" element={<Layout><Doctors /></Layout>} />
            <Route path="/doctor-profile/:doctorId" element={<Layout><DoctorProfile /></Layout>} />
            <Route path="/appointments" element={<Layout><Appointments /></Layout>} />
            {/* العلاجات الجارية was removed: unfinished treatments now show in the patient profile and treatment dialog */}
            <Route path="/ongoing-treatments" element={<Navigate to="/appointments" replace />} />
            <Route path="/treatments" element={<Layout><Treatments /></Layout>} />
            <Route path="/activity-logs" element={<Layout><ActivityLogs /></Layout>} />
            <Route path="/admin" element={<Layout><AdminDashboard /></Layout>} />
            <Route path="/waiting-list-display" element={<WaitingListDisplay />} />
            <Route path="/waiting-list-management" element={<Layout><WaitingListManagement /></Layout>} />
            <Route path="/my-finances" element={<Layout><MyFinances /></Layout>} />
            <Route path="/specialties" element={<Layout><Specialties /></Layout>} />
            <Route path="/reports" element={<Layout><Reports /></Layout>} />
            <Route path="/medicines" element={<Layout><Medicines /></Layout>} />
            {/* A4 print page: no sidebar/header */}
            <Route path="/print/prescription/:prescriptionId" element={<PrintPrescription />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH -ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthWrapper>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </DirectionProvider>
);

export default App;
