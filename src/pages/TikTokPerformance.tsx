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

type DbCampaign = {
  id: string;
  campaign_id: string;
  campaign_name: string;
  spend: number | null;
  real_conversations: number | null;
  trash_conversations: number | null;
};

const STORAGE_KEY = "tiktok_oauth_pending";

function createState(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyCrypto = globalThis.crypto as any;
  if (anyCrypto?.randomUUID) return anyCrypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const TikTokPerformance = () => {
  const { selectedClient } = useAgency();
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(true);
  const [connectedAccountCount, setConnectedAccountCount] = useState<number>(0);
  const [campaigns, setCampaigns] = useState<DbCampaign[]>([]);

  const isConnected = connectedAccountCount > 0;

  const redirectUri = useMemo(() => {
    return `${window.location.origin}/tiktok/callback`;
  }, []);

  // Transform DB campaigns to table format
  const tableCampaigns = useMemo(() => {
    return campaigns.map((c) => {
      const spend = c.spend ?? 0;
      const realConversations = c.real_conversations ?? 0;
      const trashClicks = c.trash_conversations ?? 0;
      const costPerConversation = realConversations > 0 ? spend / realConversations : 0;
      
      return {
        id: c.id,
        name: c.campaign_name,
        spend,
        realConversations,
        trashClicks,
        costPerConversation: Math.round(costPerConversation * 100) / 100,
        change: 0, // We don't have historical data yet
      };
    });
  }, [campaigns]);

  // Aggregate metrics
  const metrics = useMemo(() => {
    const totalSpend = campaigns.reduce((sum, c) => sum + (c.spend ?? 0), 0);
    const totalReal = campaigns.reduce((sum, c) => sum + (c.real_conversations ?? 0), 0);
    const totalTrash = campaigns.reduce((sum, c) => sum + (c.trash_conversations ?? 0), 0);
    const avgCost = totalReal > 0 ? totalSpend / totalReal : 0;

    return {
      totalSpend,
      totalReal,
      totalTrash,
      avgCost: Math.round(avgCost * 100) / 100,
      capiEvents: totalReal, // CAPI events = real conversations
    };
  }, [campaigns]);

  useEffect(() => {
    const loadData = async () => {
      if (!selectedClient?.id) {
        setConnectedAccountCount(0);
        setCampaigns([]);
        setIsLoadingStatus(false);
        setIsLoadingCampaigns(false);
        return;
      }

      setIsLoadingStatus(true);
      setIsLoadingCampaigns(true);

      // Load connection status and campaigns in parallel
      const [accountResult, campaignsResult] = await Promise.all([
        supabase
          .from("tiktok_accounts")
          .select("id", { count: "exact", head: true })
          .eq("client_id", selectedClient.id),
        supabase
          .from("tiktok_campaigns")
          .select("id, campaign_id, campaign_name, spend, real_conversations, trash_conversations")
          .eq("client_id", selectedClient.id)
          .order("spend", { ascending: false }),
      ]);

      if (accountResult.error) {
        console.error("Failed to load TikTok connection status:", accountResult.error);
        toast.error("Failed to load TikTok connection status");
      }
      setConnectedAccountCount(accountResult.count ?? 0);
      setIsLoadingStatus(false);

      if (campaignsResult.error) {
        console.error("Failed to load campaigns:", campaignsResult.error);
        toast.error("Failed to load campaign data");
      }
      setCampaigns((campaignsResult.data as DbCampaign[]) || []);
      setIsLoadingCampaigns(false);
    };

    loadData();
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
    
    // Reload campaigns after sync
    const { data: refreshed } = await supabase
      .from("tiktok_campaigns")
      .select("id, campaign_id, campaign_name, spend, real_conversations, trash_conversations")
      .eq("client_id", selectedClient.id)
      .order("spend", { ascending: false });
    
    setCampaigns((refreshed as DbCampaign[]) || []);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
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
          value={formatCurrency(metrics.totalSpend)}
          change={0}
          icon={<DollarSign className="w-5 h-5" />}
          trend="up"
        />
        <MetricCard
          title="Real Conversions"
          value={metrics.totalReal.toLocaleString()}
          change={0}
          icon={<Target className="w-5 h-5" />}
          trend="up"
        />
        <MetricCard
          title="Avg. Cost / Conv."
          value={formatCurrency(metrics.avgCost)}
          change={0}
          icon={<TrendingUp className="w-5 h-5" />}
          trend="up"
        />
        <MetricCard
          title="CAPI Events Sent"
          value={metrics.capiEvents.toLocaleString()}
          change={0}
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
      {isLoadingCampaigns ? (
        <div className="glass-card p-8 text-center">
          <p className="text-muted-foreground">Loading campaigns...</p>
        </div>
      ) : tableCampaigns.length > 0 ? (
        <CampaignTable campaigns={tableCampaigns} />
      ) : (
        <div className="glass-card p-8 text-center">
          <p className="text-muted-foreground">
            {isConnected 
              ? "No campaigns found. Click 'Sync Data' to fetch campaigns from TikTok."
              : "Connect your TikTok Ads account to see campaign data."}
          </p>
        </div>
      )}
    </DashboardLayout>
  );
};

export default TikTokPerformance;
