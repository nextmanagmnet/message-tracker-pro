import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { LiveFeedItem } from "@/components/dashboard/LiveFeedItem";
import { Button } from "@/components/ui/button";
import { Filter, Pause, Play, Bell, BellOff, Loader2 } from "lucide-react";
import { useAgency } from "@/hooks/useAgency";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Lead = {
  id: string;
  first_message: string;
  sender_phone_hash: string;
  status: "verified" | "pending" | "trash";
  is_real: boolean;
  created_at: string;
  whatsapp_number_id: string | null;
  ttclid: string | null;
};

const LiveFeed = () => {
  const { selectedClient } = useAgency();
  const [isPaused, setIsPaused] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [filter, setFilter] = useState<"all" | "verified" | "pending" | "trash">("all");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Initial load
  useEffect(() => {
    if (!selectedClient?.id) {
      setLeads([]);
      setIsLoading(false);
      return;
    }

    const loadLeads = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("leads")
        .select("id, first_message, sender_phone_hash, status, is_real, created_at, whatsapp_number_id, ttclid")
        .eq("client_id", selectedClient.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        console.error("Failed to load leads:", error);
        toast.error("Failed to load leads");
      } else {
        setLeads((data as Lead[]) || []);
      }
      setIsLoading(false);
    };

    loadLeads();
  }, [selectedClient?.id]);

  // Realtime subscription
  useEffect(() => {
    if (!selectedClient?.id || isPaused) return;

    const channel = supabase
      .channel(`leads-${selectedClient.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "leads",
          filter: `client_id=eq.${selectedClient.id}`,
        },
        (payload) => {
          const newLead = payload.new as Lead;
          setLeads((prev) => [newLead, ...prev.slice(0, 99)]);
          
          if (notificationsEnabled) {
            const statusLabel = newLead.is_real ? "Real" : "Trash";
            toast.info(`New ${statusLabel} lead received`);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "leads",
          filter: `client_id=eq.${selectedClient.id}`,
        },
        (payload) => {
          const updatedLead = payload.new as Lead;
          setLeads((prev) =>
            prev.map((lead) =>
              lead.id === updatedLead.id ? updatedLead : lead
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedClient?.id, isPaused, notificationsEnabled]);

  const filteredLeads = leads.filter((lead) => {
    if (filter === "all") return true;
    return lead.status === filter;
  });

  const counts = {
    all: leads.length,
    verified: leads.filter((l) => l.status === "verified").length,
    pending: leads.filter((l) => l.status === "pending").length,
    trash: leads.filter((l) => l.status === "trash").length,
  };

  const formatTimestamp = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  const maskPhoneHash = (hash: string) => {
    // Show first 4 and last 4 chars of hash
    if (hash.length <= 8) return hash;
    return `${hash.slice(0, 4)}...${hash.slice(-4)}`;
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
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : !selectedClient ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Please select a client to view leads</p>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {filter === "all" 
                ? "No messages yet. Leads will appear here in real-time." 
                : "No messages match your filter"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredLeads.map((lead) => (
              <LiveFeedItem
                key={lead.id}
                phoneNumber={maskPhoneHash(lead.sender_phone_hash)}
                message={lead.first_message}
                timestamp={formatTimestamp(lead.created_at)}
                status={lead.status}
                campaign={lead.ttclid ? "TikTok Ad" : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default LiveFeed;
