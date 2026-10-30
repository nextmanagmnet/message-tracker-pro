import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bot, Check, Hand, Loader2, Send, Sparkles, UserRound, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { db, invokeFn, Lead, maskHash, stageOf, useFormat } from "./shared";
import { PlatformChip, StageBadge } from "./badges";

type Message = { id: string; direction: "in" | "out"; author: "lead" | "owner" | "ai"; text: string; created_at: string };
type Conversation = { id: string; agent_status: "off" | "ai_active" | "handed_off" | "opted_out" };
type ConversionEvent = {
  id: string;
  platform: string;
  event_name: string;
  stage: string;
  value: number | null;
  currency: string | null;
  status: "pending" | "sent" | "failed" | "skipped";
  sent_at: string | null;
  created_at: string;
};

const EVENT_STATUS: Record<ConversionEvent["status"], string> = {
  sent: "text-success",
  pending: "text-warning",
  failed: "text-destructive",
  skipped: "text-muted-foreground",
};

export function LeadDrawer({ lead, onClose, onChanged }: { lead: Lead | null; onClose: () => void; onChanged: () => void }) {
  const { t, i18n } = useTranslation("features");
  const f = useFormat();
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [events, setEvents] = useState<ConversionEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [reply, setReply] = useState("");

  useEffect(() => {
    if (!lead) return;
    setValue(lead.order_value ? String(lead.order_value) : "");
    setCurrency(lead.order_currency ?? "USD");
    setLoading(true);
    (async () => {
      const [conv, ev] = await Promise.all([
        db.from("conversations").select("id, agent_status").eq("lead_id", lead.id).maybeSingle(),
        db.from("conversion_events")
          .select("id, platform, event_name, stage, value, currency, status, sent_at, created_at")
          .eq("lead_id", lead.id).order("created_at", { ascending: false }),
      ]);
      setConversation((conv.data as Conversation) ?? null);
      setEvents((ev.data ?? []) as ConversionEvent[]);
      if (conv.data) {
        const { data } = await db.from("messages").select("id, direction, author, text, created_at")
          .eq("conversation_id", conv.data.id).order("created_at", { ascending: true }).limit(500);
        setMessages((data ?? []) as Message[]);
      } else {
        setMessages([]);
      }
      setLoading(false);
    })();
  }, [lead]);

  // New messages (customer, you, AI) show up while the chat is open.
  const convId = conversation?.id;
  useEffect(() => {
    if (!convId) return;
    const refresh = async () => {
      const { data } = await db.from("messages").select("id, direction, author, text, created_at")
        .eq("conversation_id", convId).order("created_at", { ascending: true }).limit(500);
      if (data) setMessages(data as Message[]);
    };
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [convId]);

  const sendReply = async () => {
    if (!lead || !reply.trim()) return;
    setBusy("send_message");
    try {
      await invokeFn("lead-actions", { action: "send_message", leadId: lead.id, text: reply.trim() });
      setMessages((m) => [...m, { id: `local-${Date.now()}`, direction: "out", author: "owner", text: reply.trim(), created_at: new Date().toISOString() }]);
      setReply("");
      setConversation((c) => (c && c.agent_status === "ai_active" ? { ...c, agent_status: "handed_off" } : c));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(null);
    }
  };

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    if (!lead) return;
    setBusy(action);
    try {
      await invokeFn("lead-actions", { action, leadId: lead.id, ...extra });
      toast.success(t(`leads.done.${action}`));
      onChanged();
      if (action === "take_over") setConversation((c) => (c ? { ...c, agent_status: "handed_off" } : c));
      if (action === "hand_back") setConversation((c) => (c ? { ...c, agent_status: "ai_active" } : c));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(null);
    }
  };

  const stage = lead ? stageOf(lead) : "new";
  const AUTHOR = {
    lead: { label: t("leads.author.lead"), Icon: UserRound },
    owner: { label: t("leads.author.owner"), Icon: Hand },
    ai: { label: t("leads.author.ai"), Icon: Bot },
  };

  return (
    <Sheet open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side={i18n.dir() === "rtl" ? "left" : "right"} className="w-full sm:max-w-lg overflow-y-auto">
        {lead && (
          <>
            <SheetHeader className="text-start">
              <SheetTitle className="flex flex-wrap items-center gap-2">
                <span dir="ltr">{maskHash(lead.sender_phone_hash)}</span>
                <StageBadge stage={stage} />
                <PlatformChip platform={lead.ad_platform} />
              </SheetTitle>
              <SheetDescription>
                {f.date(lead.created_at)}
                {lead.referral_headline ? ` · ${lead.referral_headline}` : ""}
              </SheetDescription>
            </SheetHeader>

            {lead.stage_suggestion && lead.stage_suggestion !== stage && (
              <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                <p className="flex items-center gap-2 font-medium text-foreground">
                  <Sparkles className="w-4 h-4 text-primary" />
                  {t("leads.suggestion", {
                    stage: t(`stage.${lead.stage_suggestion}`),
                    value: lead.order_value ? ` — ${f.money(lead.order_value, lead.order_currency ?? "USD")}` : "",
                  })}
                </p>
                {lead.stage_evidence && <p className="mt-1 text-muted-foreground">“{lead.stage_evidence}”</p>}
                <Button size="sm" className="mt-2" onClick={() => act("accept_suggestion")} disabled={!!busy}>
                  {busy === "accept_suggestion" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {t("leads.accept")}
                </Button>
              </div>
            )}

            <section className="mt-6 space-y-3">
              <h4 className="text-sm font-semibold text-foreground">{t("leads.outcome")}</h4>
              <div className="grid grid-cols-[1fr_6rem] gap-2">
                <div>
                  <Label htmlFor="order-value" className="text-xs">{t("leads.orderValue")}</Label>
                  <Input id="order-value" type="number" min="0" step="0.01" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="order-currency" className="text-xs">{t("leads.currency")}</Label>
                  <Input id="order-currency" maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="glow"
                  disabled={!!busy || stage === "client"}
                  onClick={() => act("mark_client", { value: value ? Number(value) : null, currency })}
                >
                  {busy === "mark_client" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {t("leads.markClient")}
                </Button>
                <Button variant="outline" disabled={!!busy || stage === "not_lead"} onClick={() => act("mark_not_lead")}>
                  <XCircle className="w-4 h-4" />
                  {t("leads.notLead")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("leads.notLeadHint")}</p>
            </section>

            {conversation && conversation.agent_status !== "off" && (
              <section className="mt-6 flex items-center justify-between rounded-lg bg-secondary/50 p-3">
                <div className="text-sm">
                  <p className="font-medium text-foreground">{t(`leads.agent.${conversation.agent_status}`)}</p>
                  <p className="text-xs text-muted-foreground">{t("leads.agent.hint")}</p>
                </div>
                {conversation.agent_status === "ai_active" ? (
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act("take_over")}>{t("leads.takeOver")}</Button>
                ) : conversation.agent_status === "handed_off" ? (
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act("hand_back")}>{t("leads.handBack")}</Button>
                ) : null}
              </section>
            )}

            <section className="mt-6">
              <h4 className="mb-3 text-sm font-semibold text-foreground">{t("leads.transcript")}</h4>
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              ) : messages.length === 0 ? (
                <div className="rounded-lg bg-secondary/50 p-3 text-sm">
                  <p className="text-xs text-muted-foreground mb-1">{t("leads.firstMessage")}</p>
                  <p className="text-foreground">{lead.first_message}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {messages.map((m) => {
                    const { label, Icon } = AUTHOR[m.author];
                    return (
                      <div key={m.id} className={cn("flex", m.direction === "out" ? "justify-end" : "justify-start")}>
                        <div
                          className={cn(
                            "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                            m.direction === "out" ? "bg-primary/15 text-foreground" : "bg-secondary text-foreground"
                          )}
                        >
                          <p className="mb-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Icon className="w-3 h-3" /> {label} · {f.ago(m.created_at)}
                          </p>
                          <p className="whitespace-pre-wrap break-words">{m.text}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {conversation && (
              <div className="sticky bottom-0 mt-3 flex gap-2 bg-background py-2">
                <Input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !busy && sendReply()}
                  placeholder={t("leads.replyPlaceholder")}
                  aria-label={t("leads.replyPlaceholder")}
                />
                <Button size="icon" onClick={sendReply} disabled={!!busy || !reply.trim()} aria-label={t("leads.send")}>
                  {busy === "send_message" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 rtl:-scale-x-100" />}
                </Button>
              </div>
            )}

            <section className="mt-6 mb-2">
              <h4 className="mb-3 text-sm font-semibold text-foreground">{t("leads.conversionLog")}</h4>
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("leads.noEvents")}</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {events.map((e) => (
                    <li key={e.id} className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2">
                      <span className="flex items-center gap-2">
                        <PlatformChip platform={e.platform === "meta" || e.platform === "tiktok" ? e.platform : null} />
                        <span className="text-foreground">{e.event_name}</span>
                        {e.value ? <span className="text-muted-foreground">{f.money(e.value, e.currency ?? "USD")}</span> : null}
                      </span>
                      <span className={cn("text-xs font-medium", EVENT_STATUS[e.status])}>
                        {t(`leads.eventStatus.${e.status}`)}
                        {e.sent_at ? ` · ${f.ago(e.sent_at)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
