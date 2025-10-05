import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
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
            <Route path="/treatments" element={<Layout><Treatments /></Layout>} />
            <Route path="/activity-logs" element={<Layout><ActivityLogs /></Layout>} />
            <Route path="/admin" element={<Layout><AdminDashboard /></Layout>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthWrapper>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
