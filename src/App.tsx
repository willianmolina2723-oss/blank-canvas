import React, { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { EventProvider } from "@/contexts/EventContext";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";

import { PlanBlockedPage } from "@/components/plan/PlanGate";
import { usePlanAccess } from "@/hooks/usePlanAccess";
import { MainLayout } from "@/components/layout/MainLayout";
import { ForcePasswordChange } from "@/components/auth/ForcePasswordChange";
import type { SaaSModule } from "@/types/database";

// Lazy-loaded pages
const LandingPage = lazy(() => import("./pages/LandingPage"));
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Admin = lazy(() => import("./pages/Admin"));
const UsersPage = lazy(() => import("./pages/admin/Users"));
const AmbulancesPage = lazy(() => import("./pages/admin/Ambulances"));
const NewEventPage = lazy(() => import("./pages/admin/NewEvent"));
const EventDetailsPage = lazy(() => import("./pages/admin/EventDetails"));
const EventEditPage = lazy(() => import("./pages/admin/EventEdit"));
const PatientsPage = lazy(() => import("./pages/admin/Patients"));
const EventsPage = lazy(() => import("./pages/admin/Events"));
const ReportsPage = lazy(() => import("./pages/admin/Reports"));
const ChecklistManagementPage = lazy(() => import("./pages/admin/ChecklistManagement"));
const Checklist = lazy(() => import("./pages/Checklist"));
const PatientForm = lazy(() => import("./pages/PatientForm"));
const NursingEvolution = lazy(() => import("./pages/NursingEvolution"));
const MedicalEvolution = lazy(() => import("./pages/MedicalEvolution"));
const Transport = lazy(() => import("./pages/Transport"));
const Signatures = lazy(() => import("./pages/Signatures"));
const EventHub = lazy(() => import("./pages/EventHub"));
const Medications = lazy(() => import("./pages/Medications"));
const MaterialConsumption = lazy(() => import("./pages/MaterialConsumption"));
const MedicationConsumption = lazy(() => import("./pages/MedicationConsumption"));
const EventReport = lazy(() => import("./pages/EventReport"));
const DispatchReport = lazy(() => import("./pages/DispatchReport"));
const PayrollPage = lazy(() => import("./pages/admin/Payroll"));
const Opportunities = lazy(() => import("./pages/Opportunities"));
const FinancialPage = lazy(() => import("./pages/admin/Financial"));
const EventFinancialPage = lazy(() => import("./pages/admin/EventFinancial"));
const FinancialPaymentsPage = lazy(() => import("./pages/admin/FinancialPayments"));
const FinancialReceivablesPage = lazy(() => import("./pages/admin/FinancialReceivables"));
const FinancialCostsPage = lazy(() => import("./pages/admin/FinancialCosts"));
const SuperAdminPage = lazy(() => import("./pages/admin/SuperAdmin"));
const AdminSettingsPage = lazy(() => import("./pages/admin/Settings"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
  </div>
);

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, mustChangePassword, clearMustChangePassword } = useAuth();

  if (isLoading) return <PageLoader />;
  if (!user) return <Navigate to="/auth" replace />;
  if (mustChangePassword) return <ForcePasswordChange onComplete={clearMustChangePassword} />;

  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAdmin, mustChangePassword, clearMustChangePassword } = useAuth();

  if (isLoading) return <PageLoader />;
  if (!user) return <Navigate to="/auth" replace />;
  if (mustChangePassword) return <ForcePasswordChange onComplete={clearMustChangePassword} />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return <>{children}</>;
}

function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isSuperAdmin, mustChangePassword, clearMustChangePassword } = useAuth();

  if (isLoading) return <PageLoader />;
  if (!user) return <Navigate to="/auth" replace />;
  if (mustChangePassword) return <ForcePasswordChange onComplete={clearMustChangePassword} />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  return <>{children}</>;
}

function PlanProtectedRoute({ module, children }: { module: SaaSModule; children: React.ReactNode }) {
  const { canAccess } = usePlanAccess();

  if (!canAccess(module)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function LandingRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <LandingPage />;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <PageLoader />;
  if (user) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<LandingRedirect />} />
        <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/event/:id" element={<ProtectedRoute><EventHub /></ProtectedRoute>} />
        <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
        <Route path="/admin/users" element={<AdminRoute><UsersPage /></AdminRoute>} />
        <Route path="/admin/ambulances" element={<AdminRoute><AmbulancesPage /></AdminRoute>} />
        <Route path="/admin/events/new" element={<AdminRoute><NewEventPage /></AdminRoute>} />
        <Route path="/admin/events/:id" element={<AdminRoute><EventDetailsPage /></AdminRoute>} />
        <Route path="/admin/events/:id/edit" element={<AdminRoute><EventEditPage /></AdminRoute>} />
        <Route path="/admin/patients" element={<AdminRoute><PatientsPage /></AdminRoute>} />
        <Route path="/admin/events" element={<AdminRoute><EventsPage /></AdminRoute>} />
        <Route path="/admin/reports" element={<AdminRoute><ReportsPage /></AdminRoute>} />
        <Route path="/admin/checklist" element={<AdminRoute><ChecklistManagementPage /></AdminRoute>} />
        <Route path="/checklist/:eventId" element={<ProtectedRoute><Checklist /></ProtectedRoute>} />
        <Route path="/patient/:eventId" element={<ProtectedRoute><PatientForm /></ProtectedRoute>} />
        <Route path="/nursing-evolution/:eventId" element={<ProtectedRoute><NursingEvolution /></ProtectedRoute>} />
        <Route path="/medical-evolution/:eventId" element={<ProtectedRoute><MedicalEvolution /></ProtectedRoute>} />
        <Route path="/transport/:eventId" element={<ProtectedRoute><Transport /></ProtectedRoute>} />
        <Route path="/signatures/:eventId" element={<ProtectedRoute><Signatures /></ProtectedRoute>} />
        <Route path="/medications/:eventId" element={<ProtectedRoute><Medications /></ProtectedRoute>} />
        <Route path="/materials/:eventId" element={<ProtectedRoute><MaterialConsumption /></ProtectedRoute>} />
        <Route path="/medication-consumption/:eventId" element={<ProtectedRoute><MedicationConsumption /></ProtectedRoute>} />
        <Route path="/admin/payroll" element={<AdminRoute><PlanProtectedRoute module="pagamentos_freelancers"><FinancialPaymentsPage /></PlanProtectedRoute></AdminRoute>} />
        <Route path="/opportunities" element={<ProtectedRoute><PlanProtectedRoute module="oportunidades"><Opportunities /></PlanProtectedRoute></ProtectedRoute>} />
        <Route path="/report/:eventId" element={<ProtectedRoute><EventReport /></ProtectedRoute>} />
        <Route path="/dispatch-report/:eventId" element={<ProtectedRoute><DispatchReport /></ProtectedRoute>} />
        <Route path="/admin/financial" element={<AdminRoute><PlanProtectedRoute module="dashboard_financeiro"><FinancialPage /></PlanProtectedRoute></AdminRoute>} />
        <Route path="/admin/financial/event/:id" element={<AdminRoute><PlanProtectedRoute module="financeiro_receita_evento"><EventFinancialPage /></PlanProtectedRoute></AdminRoute>} />
        <Route path="/admin/financial/payments" element={<AdminRoute><PlanProtectedRoute module="pagamentos_freelancers"><FinancialPaymentsPage /></PlanProtectedRoute></AdminRoute>} />
        <Route path="/admin/financial/receivables" element={<AdminRoute><PlanProtectedRoute module="financeiro_contas_receber"><FinancialReceivablesPage /></PlanProtectedRoute></AdminRoute>} />
        <Route path="/admin/financial/costs" element={<AdminRoute><PlanProtectedRoute module="dashboard_financeiro"><FinancialCostsPage /></PlanProtectedRoute></AdminRoute>} />
        <Route path="/admin/settings" element={<AdminRoute><AdminSettingsPage /></AdminRoute>} />
        <Route path="/super-admin" element={<SuperAdminRoute><SuperAdminPage /></SuperAdminRoute>} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner duration={5000} />
      <PWAInstallPrompt />
      <BrowserRouter>
        <AuthProvider>
          <EventProvider>
            <AppRoutes />
          </EventProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
