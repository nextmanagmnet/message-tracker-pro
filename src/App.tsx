import { lazy, Suspense, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AgencyProvider, useAgency } from "@/hooks/useAgency";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { SetPasswordGate } from "@/components/SetPasswordGate";
import { PendingJoinRedirect } from "@/components/join/PendingJoinRedirect";
import Auth from "./pages/Auth";

const Index = lazy(() => import("./pages/Index"));
const Leads = lazy(() => import("./pages/Leads"));
const Campaigns = lazy(() => import("./pages/Campaigns"));
const AgencyCampaigns = lazy(() => import("./pages/AgencyCampaigns"));
const Connections = lazy(() => import("./pages/Connections"));
const AIAgent = lazy(() => import("./pages/AIAgent"));
const Catalog = lazy(() => import("./pages/Catalog"));
const Funding = lazy(() => import("./pages/Funding"));
const FundingAccounts = lazy(() => import("./pages/funding/Accounts"));
const FundingRequests = lazy(() => import("./pages/funding/Requests"));
const FundingPayments = lazy(() => import("./pages/funding/Payments"));
const FundingHistory = lazy(() => import("./pages/funding/History"));
const Reports = lazy(() => import("./pages/Reports"));
const Settings = lazy(() => import("./pages/Settings"));
const AgencyOverview = lazy(() => import("./pages/AgencyOverview"));
const ClientsPage = lazy(() => import("./pages/ClientsPage"));
const TikTokCallback = lazy(() => import("./pages/TikTokCallback"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Landing = lazy(() => import("./pages/Landing"));
const Launch = lazy(() => import("./pages/Launch"));
const WalletPage = lazy(() => import("./pages/Wallet"));
const AdAccounts = lazy(() => import("./pages/AdAccounts"));
const Join = lazy(() => import("./pages/Join"));
const LinkedAccount = lazy(() => import("./pages/LinkedAccount"));
const Audiences = lazy(() => import("./pages/Audiences"));
const Optimizer = lazy(() => import("./pages/Optimizer"));
const Inbox = lazy(() => import("./pages/Inbox"));

const queryClient = new QueryClient();

const PageFallback = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const P = ({ children }: { children: ReactNode }) => <ProtectedRoute>{children}</ProtectedRoute>;

// "/" is the marketing page for visitors and the dashboard once signed in.
const Home = () => {
  const { user, loading } = useAuth();
  if (loading) return <PageFallback />;
  return user ? <Index /> : <Landing />;
};

// The AI agent's setup is for the agency/owner; a client's own login doesn't get it.
const StaffOnly = ({ children }: { children: ReactNode }) => {
  const { loading, isClientUser } = useAgency();
  if (loading) return <PageFallback />;
  if (isClientUser) return <Navigate to="/" replace />;
  return <>{children}</>;
};

// Clients and the cross-client overview only exist for agency accounts.
const AgencyOnly = ({ children }: { children: ReactNode }) => {
  const { loading, isIndividual, isClientUser } = useAgency();
  if (loading) return <PageFallback />;
  if (isIndividual || isClientUser) return <Navigate to="/" replace />;
  return <P>{children}</P>;
};

// An agency that works only through linked users has no campaigns of its own to list: it picks a user instead.
const CampaignsRoute = () => {
  const { loading, isIndividual, isClientUser, clients } = useAgency();
  if (loading) return <PageFallback />;
  return !isIndividual && !isClientUser && clients.length === 0 ? <AgencyCampaigns /> : <Campaigns />;
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
              <SetPasswordGate>
                <PendingJoinRedirect />
                <Routes>
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/" element={<Home />} />
                  <Route path="/welcome" element={<Landing />} />
                  <Route
                    path="/leads"
                    element={
                      <P>
                        <Leads />
                      </P>
                    }
                  />
                  <Route
                    path="/campaigns"
                    element={
                      <P>
                        <CampaignsRoute />
                      </P>
                    }
                  />
                  <Route
                    path="/connections"
                    element={
                      <P>
                        <Connections />
                      </P>
                    }
                  />
                  <Route
                    path="/ai-agent"
                    element={
                      <P>
                        <StaffOnly>
                          <AIAgent />
                        </StaffOnly>
                      </P>
                    }
                  />
                  <Route
                    path="/catalog"
                    element={
                      <P>
                        <Catalog />
                      </P>
                    }
                  />
                  <Route
                    path="/reports"
                    element={
                      <P>
                        <Reports />
                      </P>
                    }
                  />
                  <Route
                    path="/settings"
                    element={
                      <P>
                        <Settings />
                      </P>
                    }
                  />
                  <Route
                    path="/onboarding"
                    element={
                      <P>
                        <Onboarding />
                      </P>
                    }
                  />
                  <Route
                    path="/agency"
                    element={
                      <AgencyOnly>
                        <AgencyOverview />
                      </AgencyOnly>
                    }
                  />
                  <Route
                    path="/clients"
                    element={
                      <AgencyOnly>
                        <ClientsPage />
                      </AgencyOnly>
                    }
                  />
                  <Route
                    path="/funding"
                    element={
                      <AgencyOnly>
                        <Funding />
                      </AgencyOnly>
                    }
                  >
                    <Route index element={<FundingAccounts />} />
                    <Route path="requests" element={<FundingRequests />} />
                    <Route path="payments" element={<FundingPayments />} />
                    <Route path="history" element={<FundingHistory />} />
                  </Route>
                  <Route
                    path="/tiktok/callback"
                    element={
                      <P>
                        <TikTokCallback />
                      </P>
                    }
                  />

                  {/* Old routes from before the WOB restructure */}
                  <Route
                    path="/campaigns/new"
                    element={
                      <P>
                        <Launch />
                      </P>
                    }
                  />
                  <Route
                    path="/audiences"
                    element={
                      <P>
                        <Audiences />
                      </P>
                    }
                  />
                  <Route
                    path="/optimizer"
                    element={
                      <P>
                        <Optimizer />
                      </P>
                    }
                  />
                  <Route
                    path="/inbox"
                    element={
                      <P>
                        <Inbox />
                      </P>
                    }
                  />
                  <Route
                    path="/wallet"
                    element={
                      <P>
                        <WalletPage />
                      </P>
                    }
                  />
                  <Route path="/join" element={<Join />} />
                  <Route
                    path="/linked/:clientId/launch"
                    element={
                      <AgencyOnly>
                        <Launch />
                      </AgencyOnly>
                    }
                  />
                  <Route
                    path="/linked/:clientId"
                    element={
                      <AgencyOnly>
                        <LinkedAccount />
                      </AgencyOnly>
                    }
                  />
                  <Route
                    path="/ad-accounts"
                    element={
                      <AgencyOnly>
                        <AdAccounts />
                      </AgencyOnly>
                    }
                  />
                  <Route path="/feed" element={<Navigate to="/leads" replace />} />
                  <Route path="/tiktok" element={<Navigate to="/campaigns" replace />} />
                  <Route path="/whatsapp" element={<Navigate to="/connections" replace />} />

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </SetPasswordGate>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </AgencyProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
