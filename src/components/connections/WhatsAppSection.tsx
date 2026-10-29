import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { MessageCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { WhatsAppNumberCard } from "@/components/dashboard/WhatsAppNumberCard";
import { WhatsAppConnectDialog } from "@/components/whatsapp/WhatsAppConnectDialog";
import { invokeFn } from "@/components/leads/shared";
import { ConnectionCard } from "./ConnectionCard";

type Num = { id: string; phone_number: string; status: string };
type LeadLite = { whatsapp_number_id: string | null; is_real: boolean; first_message: string; created_at: string };

export function WhatsAppSection({ clientId, isIndividual, canManage }: { clientId: string; isIndividual: boolean; canManage: boolean }) {
  const { t } = useTranslation("features");
  const [numbers, setNumbers] = useState<Num[] | null>(null);
  const [leads, setLeads] = useState<LeadLite[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    const [n, l] = await Promise.all([
      supabase.from("whatsapp_numbers").select("id, phone_number, status").eq("client_id", clientId).order("created_at", { ascending: false }),
      supabase.from("leads").select("whatsapp_number_id, is_real, first_message, created_at").eq("client_id", clientId)
        .order("created_at", { ascending: false }).limit(500),
    ]);
    if (n.error) toast.error(t("whatsapp.loadFailed"));
    setNumbers(n.data ?? []);
    setLeads((l.data ?? []) as LeadLite[]);
  }, [clientId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const map = new Map<string, { real: number; trash: number; last?: string }>();
    for (const l of leads) {
      if (!l.whatsapp_number_id) continue;
      const s = map.get(l.whatsapp_number_id) ?? { real: 0, trash: 0 };
      if (l.is_real) s.real++;
      else s.trash++;
      s.last ??= l.first_message; // leads are newest-first
      map.set(l.whatsapp_number_id, s);
    }
    return map;
  }, [leads]);

  const action = (name: "disconnect" | "remove" | "reconnect") => async (numberId: string) => {
    try {
      await invokeFn("whatsapp-connect", { action: name, clientId, numberId });
      toast.success(t(`whatsapp.done.${name}`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
    load();
  };

  const active = (numbers ?? []).filter((n) => n.status !== "disconnected");
  const canAdd = canManage && !(isIndividual && (numbers?.length ?? 0) >= 1);

  return (
    <ConnectionCard
      icon={<MessageCircle className="h-6 w-6" />}
      accent="bg-success"
      title={t("connections.whatsapp.title")}
      description={t("connections.whatsapp.description")}
      connected={numbers === null ? null : active.length > 0}
      actions={
        canAdd && (
          <Button variant="glow" onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4" />
            {t("connections.whatsapp.add")}
          </Button>
        )
      }
    >
      {numbers && numbers.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {numbers.map((n) => {
            const s = stats.get(n.id);
            return (
              <WhatsAppNumberCard
                key={n.id}
                id={n.id}
                phoneNumber={n.phone_number}
                status={n.status === "connected" ? "connected" : "disconnected"}
                realMessages={s?.real ?? 0}
                trashMessages={s?.trash ?? 0}
                lastMessage={s?.last}
                onDisconnect={canManage ? action("disconnect") : undefined}
                onRemove={canManage ? action("remove") : undefined}
                onReconnect={canManage ? action("reconnect") : undefined}
              />
            );
          })}
        </div>
      )}
      {isIndividual && (numbers?.length ?? 0) >= 1 && (
        <p className="mt-3 text-xs text-muted-foreground">{t("limits.whatsapp")}</p>
      )}
      <WhatsAppConnectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        clientId={clientId}
        onSuccess={load}
      />
    </ConnectionCard>
  );
}

