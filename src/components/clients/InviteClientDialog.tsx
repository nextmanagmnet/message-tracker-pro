import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Copy, Loader2, MessageCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { invokeFn } from "@/components/leads/shared";

type Invite = { id: string; email: string; created_at: string; accepted_at: string | null };
type ClientUser = { user_id: string; email: string | null };

// Give a client their own login (one client only). The agency sends the link however it likes.
export function InviteClientDialog({ client, onClose }: { client: { id: string; name: string } | null; onClose: () => void }) {
  const { t } = useTranslation("features");
  const [invites, setInvites] = useState<Invite[]>([]);
  const [users, setUsers] = useState<ClientUser[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!client) return;
    const [inv, members] = await Promise.all([
      supabase.from("client_invites").select("id, email, created_at, accepted_at").eq("client_id", client.id).is("accepted_at", null),
      supabase.from("agency_members").select("user_id").eq("client_id", client.id).eq("role", "client"),
    ]);
    setInvites((inv.data ?? []) as Invite[]);
    const ids = (members.data ?? []).map((m) => m.user_id);
    const profiles = ids.length ? (await supabase.from("profiles").select("id, email").in("id", ids)).data ?? [] : [];
    setUsers(ids.map((id) => ({ user_id: id, email: profiles.find((p) => p.id === id)?.email ?? null })));
  }, [client]);

  useEffect(() => {
    setLink(null);
    setEmail("");
    load();
  }, [load]);

  const create = async () => {
    if (!client) return;
    setBusy(true);
    try {
      const d = await invokeFn<{ link: string }>("client-invite", { action: "create", clientId: client.id, email });
      setLink(d.link);
      setEmail("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    try {
      await invokeFn("client-invite", { action: "revoke", inviteId: id });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  };

  const message = link ? t("invite.message", { name: client?.name, link }) : "";

  return (
    <Dialog open={!!client} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("invite.dialogTitle", { name: client?.name })}</DialogTitle>
          <DialogDescription>{t("invite.dialogHint")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="invite-email">{t("invite.email")}</Label>
          <div className="flex gap-2">
            <Input id="invite-email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !busy && email && create()} />
            <Button variant="glow" onClick={create} disabled={busy || !email.trim()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t("invite.create")}
            </Button>
          </div>
        </div>

        {link && (
          <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="text-sm font-medium text-foreground">{t("invite.ready")}</p>
            <p className="break-all text-xs text-muted-foreground" dir="ltr">{link}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(link).then(() => toast.success(t("common.copied")))}>
                <Copy className="h-4 w-4" /> {t("invite.copy")}
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
                  <MessageCircle className="h-4 w-4" /> {t("invite.whatsapp")}
                </a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("invite.oneTime")}</p>
          </div>
        )}

        {users.length > 0 && (
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">{t("invite.active")}</p>
            {users.map((u) => <p key={u.user_id} className="text-sm text-muted-foreground" dir="ltr">{u.email ?? u.user_id}</p>)}
          </div>
        )}

        {invites.length > 0 && (
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">{t("invite.pending")}</p>
            {invites.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                <span dir="ltr">{i.email}</span>
                <Button size="icon" variant="ghost" aria-label={t("invite.revoke")} onClick={() => revoke(i.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
