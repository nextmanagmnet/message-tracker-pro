import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { CampaignTable } from "@/components/dashboard/CampaignTable";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { Button } from "@/components/ui/button";
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

const TikTokPerformance = () => {
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
                <span className="badge-verified">Connected</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Advertiser ID: 7234567890123456789
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm">
              <RefreshCw className="w-4 h-4" />
              Sync Data
            </Button>
            <Button variant="outline" size="sm">
              <ExternalLink className="w-4 h-4" />
              Open TikTok Ads
            </Button>
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
