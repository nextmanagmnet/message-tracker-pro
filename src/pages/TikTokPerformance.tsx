import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { CampaignTable } from "@/components/dashboard/CampaignTable";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { Button } from "@/components/ui/button";
import { useAgency } from "@/hooks/useAgency";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import { 
  RefreshCw, 
  Download, 
  DollarSign, 
  Target, 
  TrendingUp, 
  Zap,
  ExternalLink 
} from "lucide-react";

const mockCampaigns = [
  {
    id: "1",
    name: "Summer Sale 2024",
    spend: 2450,
    realConversations: 156,
    trashClicks: 42,
    costPerConversation: 15.71,
    change: 12,
  },
  {
    id: "2",
    name: "Product Launch",
    spend: 1820,
    realConversations: 98,
    trashClicks: 65,
    costPerConversation: 18.57,
    change: -5,
  },
  {
    id: "3",
    name: "Brand Awareness",
    spend: 3200,
    realConversations: 210,
    trashClicks: 38,
    costPerConversation: 15.24,
    change: 23,
  },
  {
    id: "4",
    name: "Holiday Promo",
    spend: 1500,
    realConversations: 85,
    trashClicks: 28,
    costPerConversation: 17.65,
    change: 8,
  },
  {
    id: "5",
    name: "New Collection",
    spend: 2100,
    realConversations: 142,
    trashClicks: 51,
    costPerConversation: 14.79,
    change: 15,
  },
];

const STORAGE_KEY = "tiktok_oauth_pending";

function createState(): string {
  // Prefer crypto UUID; fallback to random.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyCrypto = globalThis.crypto as any;
  if (anyCrypto?.randomUUID) return anyCrypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const TikTokPerformance = () => {
  const { selectedClient } = useAgency();
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [connectedAccountCount, setConnectedAccountCount] = useState<number>(0);

  const isConnected = connectedAccountCount > 0;

  const redirectUri = useMemo(() => {
    return `${window.location.origin}/tiktok/callback`;
  }, []);

  useEffect(() => {
    (async () => {
      if (!selectedClient?.id) {
        setConnectedAccountCount(0);
        setIsLoadingStatus(false);
        return;
      }

      setIsLoadingStatus(true);
      const { count, error } = await supabase
        .from("tiktok_accounts")
        .select("id", { count: "exact", head: true })
        .eq("client_id", selectedClient.id);

      if (error) {
        console.error("Failed to load TikTok connection status:", error);
        toast.error("Failed to load TikTok connection status");
        setConnectedAccountCount(0);
        setIsLoadingStatus(false);
        return;
      }

      setConnectedAccountCount(count ?? 0);
      setIsLoadingStatus(false);
    })();
  }, [selectedClient?.id]);

  const handleConnect = async () => {
    if (!selectedClient?.id) {
      toast.error("Please select a client first");
      return;
    }

    const state = createState();
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ clientId: selectedClient.id, state, createdAt: Date.now() })
    );

    const { data, error } = await supabase.functions.invoke("tiktok-oauth", {
      body: {
        action: "get-auth-url",
        redirectUri,
        state,
      },
    });

    if (error) {
      console.error("Failed to start TikTok connect:", error);
      toast.error("Failed to start TikTok connection");
      return;
    }

    if (!data?.authUrl) {
      console.error("Missing authUrl:", data);
      toast.error("TikTok auth URL was not returned");
      return;
    }

    window.location.href = data.authUrl;
  };

  const handleSync = async () => {
    if (!selectedClient?.id) {
      toast.error("Please select a client first");
      return;
    }
    const { data, error } = await supabase.functions.invoke("tiktok-oauth", {
      body: { action: "fetch-campaigns", clientId: selectedClient.id },
    });

    if (error) {
      console.error("Sync failed:", error);
      toast.error("Sync failed");
      return;
    }

    toast.success(`Synced ${data?.campaigns?.length ?? 0} campaign(s)`);
  };

  return (
    <DashboardLayout
      title="TikTok Performance"
      subtitle="Real conversion data from your TikTok ad campaigns"
    >
      {/* Connection Status */}
      <div className="glass-card p-4 mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-red-500 flex items-center justify-center">
              <Zap className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-foreground">TikTok Ads Account</h3>
                {isLoadingStatus ? (
                  <span className="badge-pending">Checking…</span>
                ) : isConnected ? (
                  <span className="badge-verified">Connected</span>
                ) : (
                  <span className="badge-pending">Not connected</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {selectedClient?.name ? (
                  <>Client: {selectedClient.name}</>
                ) : (
                  <>Select a client to connect TikTok</>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={handleSync} disabled={!isConnected}>
              <RefreshCw className="w-4 h-4" />
              Sync Data
            </Button>
            {isConnected ? (
              <Button variant="outline" size="sm" disabled>
                <ExternalLink className="w-4 h-4" />
                Manage
              </Button>
            ) : (
              <Button variant="glow" size="sm" onClick={handleConnect}>
                <ExternalLink className="w-4 h-4" />
                Connect
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricCard
          title="Total Spend"
          value="$11,070"
          change={15}
          icon={<DollarSign className="w-5 h-5" />}
          trend="up"
        />
        <MetricCard
          title="Real Conversions"
          value="691"
          change={22}
          icon={<Target className="w-5 h-5" />}
          trend="up"
        />
        <MetricCard
          title="Avg. Cost / Conv."
          value="$16.02"
          change={-8}
          icon={<TrendingUp className="w-5 h-5" />}
          trend="up"
        />
        <MetricCard
          title="CAPI Events Sent"
          value="691"
          change={22}
          icon={<Zap className="w-5 h-5" />}
          trend="up"
        />
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Showing data for:</span>
          <select className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
            <option>Last 7 days</option>
            <option>Last 30 days</option>
            <option>This month</option>
            <option>Last month</option>
          </select>
        </div>
        <Button variant="outline">
          <Download className="w-4 h-4" />
          Export Report
        </Button>
      </div>

      {/* Campaign Table */}
      <CampaignTable campaigns={mockCampaigns} />
    </DashboardLayout>
  );
};

export default TikTokPerformance;
