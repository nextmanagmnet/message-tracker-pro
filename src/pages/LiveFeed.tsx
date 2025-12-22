import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { LiveFeedItem } from "@/components/dashboard/LiveFeedItem";
import { Button } from "@/components/ui/button";
import { Filter, Pause, Play, Bell, BellOff } from "lucide-react";

const mockMessages = [
  {
    phoneNumber: "+1 (555) 123-4567",
    message: "Hi, I saw your ad on TikTok and I'm interested in the summer collection. Can you tell me more about the prices?",
    timestamp: "Just now",
    status: "verified" as const,
    campaign: "Summer Sale 2024",
  },
  {
    phoneNumber: "+1 (555) 987-6543",
    message: "👍",
    timestamp: "1 min ago",
    status: "trash" as const,
  },
  {
    phoneNumber: "+1 (555) 456-7890",
    message: "Can you tell me more about the pricing for the premium package? I'm looking to buy in bulk.",
    timestamp: "2 min ago",
    status: "verified" as const,
    campaign: "Product Launch",
  },
  {
    phoneNumber: "+1 (555) 321-0987",
    message: "Hello, I'd like to place an order for the new product line. What's the minimum order quantity?",
    timestamp: "5 min ago",
    status: "pending" as const,
    campaign: "Brand Awareness",
  },
  {
    phoneNumber: "+1 (555) 654-3210",
    message: "😊😊😊",
    timestamp: "8 min ago",
    status: "trash" as const,
  },
  {
    phoneNumber: "+1 (555) 789-0123",
    message: "I want to know if you ship internationally? Specifically to Canada.",
    timestamp: "12 min ago",
    status: "verified" as const,
    campaign: "Summer Sale 2024",
  },
  {
    phoneNumber: "+1 (555) 234-5678",
    message: "Do you have this in blue color?",
    timestamp: "15 min ago",
    status: "verified" as const,
    campaign: "New Collection",
  },
  {
    phoneNumber: "+1 (555) 876-5432",
    message: "Hi",
    timestamp: "18 min ago",
    status: "trash" as const,
  },
  {
    phoneNumber: "+1 (555) 345-6789",
    message: "I'm interested in becoming a reseller. Who should I contact?",
    timestamp: "22 min ago",
    status: "verified" as const,
    campaign: "Brand Awareness",
  },
  {
    phoneNumber: "+1 (555) 567-8901",
    message: "What are your business hours? I tried calling but no answer.",
    timestamp: "28 min ago",
    status: "verified" as const,
    campaign: "Product Launch",
  },
];

const LiveFeed = () => {
  const [isPaused, setIsPaused] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [filter, setFilter] = useState<"all" | "verified" | "pending" | "trash">("all");

  const filteredMessages = mockMessages.filter((msg) => {
    if (filter === "all") return true;
    return msg.status === filter;
  });

  const counts = {
    all: mockMessages.length,
    verified: mockMessages.filter((m) => m.status === "verified").length,
    pending: mockMessages.filter((m) => m.status === "pending").length,
    trash: mockMessages.filter((m) => m.status === "trash").length,
  };

  return (
    <DashboardLayout
      title="Live Feed"
      subtitle="Real-time incoming WhatsApp messages"
    >
      {/* Status Bar */}
      <div className="glass-card p-4 mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              {!isPaused && <div className="pulse-dot" />}
              <span className={`text-sm font-medium ${isPaused ? "text-muted-foreground" : "text-success"}`}>
                {isPaused ? "Paused" : "Live"}
              </span>
            </div>
            <div className="h-6 w-px bg-border" />
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">
                <span className="font-semibold text-foreground">{counts.verified}</span> verified
              </span>
              <span className="text-muted-foreground">
                <span className="font-semibold text-foreground">{counts.pending}</span> pending
              </span>
              <span className="text-muted-foreground">
                <span className="font-semibold text-foreground">{counts.trash}</span> trash
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNotificationsEnabled(!notificationsEnabled)}
            >
              {notificationsEnabled ? (
                <>
                  <Bell className="w-4 h-4" />
                  Notifications On
                </>
              ) : (
                <>
                  <BellOff className="w-4 h-4" />
                  Notifications Off
                </>
              )}
            </Button>
            <Button
              variant={isPaused ? "glow" : "outline"}
              size="sm"
              onClick={() => setIsPaused(!isPaused)}
            >
              {isPaused ? (
                <>
                  <Play className="w-4 h-4" />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="w-4 h-4" />
                  Pause
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 mb-6">
        <Filter className="w-4 h-4 text-muted-foreground" />
        {(["all", "verified", "pending", "trash"] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === status
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
            <span className="ml-2 opacity-70">({counts[status]})</span>
          </button>
        ))}
      </div>

      {/* Messages List */}
      <div className="glass-card p-6">
        <div className="space-y-3">
          {filteredMessages.map((message, index) => (
            <LiveFeedItem key={index} {...message} />
          ))}
        </div>

        {filteredMessages.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No messages match your filter</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default LiveFeed;
