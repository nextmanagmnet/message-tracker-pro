import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { LiveFeedItem } from "@/components/dashboard/LiveFeedItem";
import { CampaignTable } from "@/components/dashboard/CampaignTable";
import { ConversionChart, ChartPoint } from "@/components/dashboard/ConversionChart";
import { DateRangePicker, DateRange, getDefaultDateRange } from "@/components/dashboard/DateRangePicker";
import { MessageCircle, DollarSign, TrendingUp, AlertTriangle, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAgency } from "@/hooks/useAgency";
import { supabase } from "@/integrations/supabase/client";

type Lead = {
  id: string;
  first_message: string;
  sender_phone_hash: string;
  status: "verified" | "pending" | "trash";
  created_at: string;
  quality_score: number;
  quality_signals: Record<string, unknown> | null;
  attribution_source: string;
  referral_headline: string | null;
  is_repeat_lead: boolean;
  click_to_message_seconds: number | null;
};

type Campaign = {
  id: string;
  campaign_name: string;
  spend: number | null;
  real_conversations: number | null;
  trash_conversations: number | null;
};

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

const Index = () => {
  const navigate = useNavigate();
  const { selectedClient } = useAgency();
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange());
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedClient) {
      setLeads([]);
      setCampaigns([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      supabase
        .from("leads")
        .select("id, first_message, sender_phone_hash, status, created_at, quality_score, quality_signals, attribution_source, referral_headline, is_repeat_lead, click_to_message_seconds")
        .eq("client_id", selectedClient.id)
        .gte("created_at", dateRange.from.toISOString())
        .lte("created_at", dateRange.to.toISOString())
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase
        .from("tiktok_campaigns")
        .select("id, campaign_name, spend, real_conversations, trash_conversations")
        .eq("client_id", selectedClient.id)
        .order("spend", { ascending: false }),
    ]).then(([l, c]) => {
      setLeads(((l.data ?? []) as unknown) as Lead[]);
      setCampaigns((c.data ?? []) as Campaign[]);
      setLoading(false);
    });
  }, [selectedClient?.id, dateRange]);

  const stats = useMemo(() => {
    const real = leads.filter((l) => l.status === "verified").length;
    const trash = leads.filter((l) => l.status === "trash").length;
    const spend = campaigns.reduce((s, c) => s + (Number(c.spend) || 0), 0);
    const total = leads.length;
    return {
      real,
      cost: real > 0 ? spend / real : 0,
      rate: total > 0 ? (real / total) * 100 : 0,
      trashRatio: total > 0 ? (trash / total) * 100 : 0,
    };
  }, [leads, campaigns]);

  const chartData = useMemo<ChartPoint[]>(() => {
    const map = new Map<string, ChartPoint>();
    const start = new Date(dateRange.from);
    start.setHours(0, 0, 0, 0);
    for (let d = new Date(start); d <= dateRange.to; d.setDate(d.getDate() + 1)) {
      map.set(dayKey(d), {
        date: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        real: 0,
        trash: 0,
      });
    }
    for (const l of leads) {
      const p = map.get(dayKey(new Date(l.created_at)));
      if (!p) continue;
      if (l.status === "verified") p.real++;
      else if (l.status === "trash") p.trash++;
    }
    return [...map.values()];
  }, [leads, dateRange]);

  const tableCampaigns = campaigns.map((c) => {
    const spend = Number(c.spend) || 0;
    const real = c.real_conversations ?? 0;
    return {
      id: c.id,
      name: c.campaign_name,
      spend,
      realConversations: real,
      trashClicks: c.trash_conversations ?? 0,
      costPerConversation: real > 0 ? Math.round((spend / real) * 100) / 100 : 0,
      change: 0,
    };
  });

  const mask = (h: string) => (h.length <= 8 ? h : `${h.slice(0, 4)}...${h.slice(-4)}`);
  const ago = (s: string) => {
    const m = Math.floor((Date.now() - new Date(s).getTime()) / 60000);
    if (m < 1) return "Just now";
    if (m < 60) return `${m} min ago`;
    if (m < 1440) return `${Math.floor(m / 60)}h ago`;
    return new Date(s).toLocaleDateString();
  };

  return (
    <DashboardLayout
      title="Overview"
      subtitle={selectedClient ? `Real WhatsApp conversations for ${selectedClient.name}` : "Select a client to get started"}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <DateRangePicker value={dateRange} onChange={setDateRange} />
        <Button variant="glow" onClick={() => navigate("/whatsapp")}>
          <Plus className="w-4 h-4" />
          Add WhatsApp Number
        </Button>
      </div>

      {!selectedClient ? (
        <div className="glass-card p-12 text-center">
          <p className="text-muted-foreground mb-4">You don't have a client selected yet.</p>
          <Button onClick={() => navigate("/clients")}>Go to Clients</Button>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <MetricCard title="Real Conversations" value={stats.real} icon={<MessageCircle className="w-5 h-5" />} />
            <MetricCard
              title="Cost per Conversation"
              value={stats.real > 0 ? `$${stats.cost.toFixed(2)}` : "—"}
              icon={<DollarSign className="w-5 h-5" />}
            />
            <MetricCard title="Real Rate" value={`${stats.rate.toFixed(1)}%`} icon={<TrendingUp className="w-5 h-5" />} />
            <MetricCard title="Trash Ratio" value={`${stats.trashRatio.toFixed(1)}%`} icon={<AlertTriangle className="w-5 h-5" />} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="lg:col-span-2">
              <ConversionChart data={chartData} />
            </div>
            <div className="glass-card p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Latest Messages</h3>
                  <p className="text-sm text-muted-foreground">Most recent conversations</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => navigate("/feed")}>View all</Button>
              </div>
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {leads.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">No messages yet.</p>
                ) : (
                  leads.slice(0, 8).map((l) => (
                    <LiveFeedItem
                      key={l.id}
                      phoneNumber={mask(l.sender_phone_hash)}
                      message={l.first_message}
                      timestamp={ago(l.created_at)}
                      status={l.status}
                      campaign={l.referral_headline ?? undefined}
                      qualityScore={l.quality_score}
                      attributionSource={l.attribution_source}
                      signals={l.quality_signals}
                      isRepeat={l.is_repeat_lead}
                      clickToMessageSeconds={l.click_to_message_seconds}
                    />
                  ))
                )}
              </div>
            </div>
          </div>

          {tableCampaigns.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <p className="text-muted-foreground mb-4">No TikTok campaigns yet for this client.</p>
              <Button variant="outline" onClick={() => navigate("/tiktok")}>Connect TikTok Ads</Button>
            </div>
          ) : (
            <CampaignTable campaigns={tableCampaigns} />
          )}
        </>
      )}
    </DashboardLayout>
  );
};

export default Index;
