import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { LiveFeedItem } from "@/components/dashboard/LiveFeedItem";
import { CampaignTable } from "@/components/dashboard/CampaignTable";
import { ConversionChart } from "@/components/dashboard/ConversionChart";
import { MessageCircle, DollarSign, TrendingUp, AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

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
];

const mockLiveFeed = [
  {
    phoneNumber: "+1 (555) 123-4567",
    message: "Hi, I saw your ad on TikTok and I'm interested in the summer collection...",
    timestamp: "2 min ago",
    status: "verified" as const,
    campaign: "Summer Sale 2024",
  },
  {
    phoneNumber: "+1 (555) 987-6543",
    message: "👍",
    timestamp: "5 min ago",
    status: "trash" as const,
  },
  {
    phoneNumber: "+1 (555) 456-7890",
    message: "Can you tell me more about the pricing for the premium package?",
    timestamp: "8 min ago",
    status: "verified" as const,
    campaign: "Product Launch",
  },
  {
    phoneNumber: "+1 (555) 321-0987",
    message: "Hello, I'd like to place an order for the new product line",
    timestamp: "12 min ago",
    status: "pending" as const,
    campaign: "Brand Awareness",
  },
];

const Index = () => {
  return (
    <DashboardLayout
      title="Overview"
      subtitle="Track your real WhatsApp conversions from TikTok ads"
    >
      {/* Action Bar */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Last 7 days</span>
          <div className="pulse-dot" />
          <span className="text-sm text-success">Live</span>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline">
            Export Report
          </Button>
          <Button variant="glow">
            <Plus className="w-4 h-4" />
            Add WhatsApp Number
          </Button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricCard
          title="Real Conversations"
          value="464"
          change={18}
          icon={<MessageCircle className="w-5 h-5" />}
          trend="up"
        />
        <MetricCard
          title="Cost per Conversation"
          value="$16.12"
          change={-8}
          icon={<DollarSign className="w-5 h-5" />}
          trend="up"
        />
        <MetricCard
          title="Conversion Rate"
          value="76.2%"
          change={5}
          icon={<TrendingUp className="w-5 h-5" />}
          trend="up"
        />
        <MetricCard
          title="Trash Ratio"
          value="23.8%"
          change={-12}
          icon={<AlertTriangle className="w-5 h-5" />}
          trend="down"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Chart */}
        <div className="lg:col-span-2">
          <ConversionChart />
        </div>

        {/* Live Feed */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Live Feed</h3>
              <p className="text-sm text-muted-foreground">Real-time messages</p>
            </div>
            <div className="pulse-dot" />
          </div>

          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {mockLiveFeed.map((item, index) => (
              <LiveFeedItem key={index} {...item} />
            ))}
          </div>
        </div>
      </div>

      {/* Campaign Table */}
      <CampaignTable campaigns={mockCampaigns} />
    </DashboardLayout>
  );
};

export default Index;
