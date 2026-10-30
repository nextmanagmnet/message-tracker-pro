import { lazy, Suspense, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { AgencyProvider, useAgency } from "@/hooks/useAgency";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Auth from "./pages/Auth";

const Index = lazy(() => import("./pages/Index"));
const Leads = lazy(() => import("./pages/Leads"));
const Campaigns = lazy(() => import("./pages/Campaigns"));
const Connections = lazy(() => import("./pages/Connections"));
const AIAgent = lazy(() => import("./pages/AIAgent"));
const Reports = lazy(() => import("./pages/Reports"));
const Settings = lazy(() => import("./pages/Settings"));
const AgencyOverview = lazy(() => import("./pages/AgencyOverview"));
const ClientsPage = lazy(() => import("./pages/ClientsPage"));
const TikTokCallback = lazy(() => import("./pages/TikTokCallback"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const PageFallback = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const P = ({ children }: { children: ReactNode }) => <ProtectedRoute>{children}</ProtectedRoute>;

// Clients and the cross-client overview only exist for agency accounts.
const AgencyOnly = ({ children }: { children: ReactNode }) => {
  const { loading, isIndividual } = useAgency();
  if (loading) return <PageFallback />;
  if (isIndividual) return <Navigate to="/" replace />;
  return <P>{children}</P>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <AgencyProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/" element={<P><Index /></P>} />
                <Route path="/leads" element={<P><Leads /></P>} />
                <Route path="/campaigns" element={<P><Campaigns /></P>} />
                <Route path="/connections" element={<P><Connections /></P>} />
                <Route path="/ai-agent" element={<P><AIAgent /></P>} />
                <Route path="/reports" element={<P><Reports /></P>} />
                <Route path="/settings" element={<P><Settings /></P>} />
                <Route path="/onboarding" element={<P><Onboarding /></P>} />
                <Route path="/agency" element={<AgencyOnly><AgencyOverview /></AgencyOnly>} />
                <Route path="/clients" element={<AgencyOnly><ClientsPage /></AgencyOnly>} />
                <Route path="/tiktok/callback" element={<P><TikTokCallback /></P>} />

                {/* Old routes from before the WOB restructure */}
                <Route path="/feed" element={<Navigate to="/leads" replace />} />
                <Route path="/tiktok" element={<Navigate to="/campaigns" replace />} />
                <Route path="/whatsapp" element={<Navigate to="/connections" replace />} />

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </AgencyProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
