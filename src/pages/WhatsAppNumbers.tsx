import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { WhatsAppNumberCard } from "@/components/dashboard/WhatsAppNumberCard";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCw } from "lucide-react";
import { useAgency } from "@/hooks/useAgency";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";

type DbWhatsAppNumber = {
  id: string;
  phone_number: string;
  phone_number_id: string;
  status: string;
};

type DbLead = {
  whatsapp_number_id: string | null;
  is_real: boolean;
  first_message: string;
  created_at: string;
};

const WhatsAppNumbers = () => {
  const { selectedClient } = useAgency();
  const [isLoading, setIsLoading] = useState(true);
  const [numbers, setNumbers] = useState<DbWhatsAppNumber[]>([]);
  const [leads, setLeads] = useState<DbLead[]>([]);

  const statsByNumberId = useMemo(() => {
    const map = new Map<
      string,
      { real: number; trash: number; lastMessage?: string; lastMessageAt?: number }
    >();

    for (const lead of leads) {
      if (!lead.whatsapp_number_id) continue;
      const current = map.get(lead.whatsapp_number_id) ?? { real: 0, trash: 0 };
      if (lead.is_real) current.real += 1;
      else current.trash += 1;

      const t = new Date(lead.created_at).getTime();
      if (!current.lastMessageAt || t > current.lastMessageAt) {
        current.lastMessageAt = t;
        current.lastMessage = lead.first_message;
      }
      map.set(lead.whatsapp_number_id, current);
    }
    return map;
  }, [leads]);

  const connectedCount = useMemo(() => {
    return numbers.filter((n) => n.status === "connected").length;
  }, [numbers]);

  const load = async () => {
    if (!selectedClient?.id) {
      setNumbers([]);
      setLeads([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const [{ data: nums, error: numsError }, { data: leadsData, error: leadsError }] =
      await Promise.all([
        supabase
          .from("whatsapp_numbers")
          .select("id, phone_number, phone_number_id, status")
          .eq("client_id", selectedClient.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("leads")
          .select("whatsapp_number_id, is_real, first_message, created_at")
          .eq("client_id", selectedClient.id)
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

    if (numsError) {
      console.error("Failed to load WhatsApp numbers:", numsError);
      toast.error("Failed to load WhatsApp numbers");
    }
    if (leadsError) {
      console.error("Failed to load lead stats:", leadsError);
      toast.error("Failed to load WhatsApp stats");
    }

    setNumbers((nums as DbWhatsAppNumber[]) || []);
    setLeads((leadsData as DbLead[]) || []);
    setIsLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClient?.id]);

  return (
    <DashboardLayout
      title="WhatsApp Numbers"
      subtitle="Manage your connected WhatsApp Business numbers"
    >
      {/* Action Bar */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary">
            <span className="text-sm text-muted-foreground">Total Numbers:</span>
            <span className="font-semibold text-foreground">{numbers.length}</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-success/10">
            <div className="w-2 h-2 rounded-full bg-success" />
            <span className="text-sm text-success">{connectedCount} Connected</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={load} disabled={isLoading}>
            <RefreshCw className="w-4 h-4" />
            Refresh Status
          </Button>
          <Button
            variant="glow"
            onClick={() => toast.info("WhatsApp number connection UI is next — we’ll add Embedded Signup here.")}
          >
            <Plus className="w-4 h-4" />
            Add Number
          </Button>
        </div>
      </div>

      {/* Numbers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {numbers.map((n) => {
          const stats = statsByNumberId.get(n.id);
          const status = n.status === "connected" ? "connected" : "disconnected";
          return (
            <WhatsAppNumberCard
              key={n.id}
              phoneNumber={n.phone_number}
              status={status}
              realMessages={stats?.real ?? 0}
              trashMessages={stats?.trash ?? 0}
              lastMessage={stats?.lastMessage}
            />
          );
        })}

        {/* Add New Card */}
        <button className="glass-card p-6 border-2 border-dashed border-border hover:border-primary/50 transition-colors flex flex-col items-center justify-center gap-4 min-h-[240px] group">
          <div className="p-4 rounded-2xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
            <Plus className="w-8 h-8 text-primary" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-foreground">Add WhatsApp Number</p>
            <p className="text-sm text-muted-foreground mt-1">
              Connect via Meta Business
            </p>
          </div>
        </button>
      </div>
    </DashboardLayout>
  );
};

export default WhatsAppNumbers;
