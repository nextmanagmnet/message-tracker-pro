import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "react-router-dom";
import { AlertTriangle, Bot, ChevronRight, Loader2, Package, Pencil, Send, Trash2 } from "lucide-react";
import { useAgency } from "@/hooks/useAgency";
import { cn } from "@/lib/utils";
import { db, invokeFn } from "@/components/leads/shared";

type Settings = {
  enabled: boolean;
  business_knowledge: string;
  tone: string;
  qualifying_questions: string;
  handoff_rules: string;
  follow_up_enabled: boolean;
  follow_up_delay_hours: number;
  follow_up_max: number;
  allowed_hours_start: number;
  allowed_hours_end: number;
  timezone: string;
};

const DEFAULTS: Settings = {
  enabled: false,
  business_knowledge: "",
  tone: "",
  qualifying_questions: "",
  handoff_rules: "",
  follow_up_enabled: false,
  follow_up_delay_hours: 24,
  follow_up_max: 2,
  allowed_hours_start: 9,
  allowed_hours_end: 21,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Riyadh",
};

type ChatMsg = { role: "lead" | "business"; text: string };
type Verdict = { products?: string[]; reply?: string; is_spam?: boolean; qualification?: "hot" | "warm" | "cold"; handoff?: boolean; reason?: string; language?: string };

const AIAgent = () => {
  const { t } = useTranslation("features");
  const { selectedClient, canManage } = useAgency();
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Once saved, the setup folds into a short summary; "Edit" opens it again.
  const [editing, setEditing] = useState(true);
  const [productCount, setProductCount] = useState(0);

  useEffect(() => {
    if (!selectedClient) return;
    setLoading(true);
    db.from("products").select("id", { count: "exact", head: true }).eq("client_id", selectedClient.id)
      .then(({ count }) => setProductCount(count ?? 0));
    db.from("ai_agent_settings").select("*").eq("client_id", selectedClient.id).maybeSingle().then(({ data }) => {
      const row = (data ?? {}) as Partial<Settings>;
      setEditing(!data);
      // Keep only editable fields so the upsert never echoes id/timestamps back.
      setS(Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, row[k as keyof Settings] ?? v])) as Settings);
      setLoading(false);
    });
  }, [selectedClient]);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!selectedClient) return;
    if (s.allowed_hours_start >= s.allowed_hours_end) return toast.error(t("ai.hoursInvalid"));
    setSaving(true);
    const { error } = await db.from("ai_agent_settings").upsert({ client_id: selectedClient.id, ...s }, { onConflict: "client_id" });
    setSaving(false);
    if (error) return toast.error(t("ai.saveFailed"));
    toast.success(t("ai.saved"));
    setEditing(false);
  };

  const num = (k: "follow_up_delay_hours" | "follow_up_max" | "allowed_hours_start" | "allowed_hours_end", min: number, max: number) => (
    <Input
      type="number"
      min={min}
      max={max}
      value={s[k]}
      disabled={!canManage}
      onChange={(e) => set(k, Math.min(max, Math.max(min, Number(e.target.value) || 0)))}
    />
  );

  return (
    <DashboardLayout title={t("ai.title")} subtitle={t("ai.subtitle")}>
      {!selectedClient ? (
        <div className="glass-card wob-mesh-card p-12 text-center text-muted-foreground">{t("common.selectClient")}</div>
      ) : loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
          <div className="space-y-6 xl:col-span-3">
            <section className="glass-card p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="flex items-center gap-2 font-semibold text-foreground"><Bot className="w-5 h-5 text-primary" /> {t("ai.enable")}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{t("ai.enableHint")}</p>
                </div>
                <Switch
                  checked={s.enabled}
                  onCheckedChange={async (v) => {
                    set("enabled", v);
                    if (editing || !selectedClient) return;
                    const { error } = await db.from("ai_agent_settings").update({ enabled: v }).eq("client_id", selectedClient.id);
                    if (error) toast.error(t("ai.saveFailed"));
                  }}
                  disabled={!canManage}
                  aria-label={t("ai.enable")}
                />
              </div>
              <Alert className="mt-4 border-warning/40 bg-warning/5">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <AlertTitle>{t("ai.warningTitle")}</AlertTitle>
                <AlertDescription className="text-muted-foreground">{t("ai.warning")}</AlertDescription>
              </Alert>
            </section>

            <Link to="/catalog" className="glass-card flex items-center gap-4 p-5 transition-colors hover:bg-secondary/40">
              <Package className="h-6 w-6 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground">{t("catalog.title")}</p>
                <p className="text-sm text-muted-foreground">{t("ai.catalogHint", { count: productCount })}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground rtl:-scale-x-100" />
            </Link>

            {!editing ? (
              <section className="glass-card space-y-3 p-6">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="font-semibold text-foreground">{t("ai.knowledgeTitle")}</h2>
                  {canManage && (
                    <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> {t("ai.edit")}</Button>
                  )}
                </div>
                {(["business_knowledge", "tone", "qualifying_questions", "handoff_rules"] as const).map((k) => (
                  <div key={k}>
                    <p className="text-xs text-muted-foreground">{t(`ai.field.${k}`)}</p>
                    <p className="line-clamp-2 whitespace-pre-wrap text-sm text-foreground">{s[k] || "—"}</p>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  {s.follow_up_enabled
                    ? t("ai.followUpSummary", { max: s.follow_up_max, hours: s.follow_up_delay_hours, from: s.allowed_hours_start, to: s.allowed_hours_end })
                    : t("ai.followUpOff")}
                </p>
              </section>
            ) : (
            <>
            <section className="glass-card space-y-4 p-6">
              <h2 className="font-semibold text-foreground">{t("ai.knowledgeTitle")}</h2>
              {([
                ["business_knowledge", 6],
                ["tone", 2],
                ["qualifying_questions", 4],
                ["handoff_rules", 3],
              ] as const).map(([k, rows]) => (
                <div key={k} className="space-y-1.5">
                  <Label htmlFor={k}>{t(`ai.field.${k}`)}</Label>
                  <Textarea id={k} rows={rows} value={s[k]} disabled={!canManage} placeholder={t(`ai.placeholder.${k}`)} onChange={(e) => set(k, e.target.value)} />
                </div>
              ))}
            </section>

            <section className="glass-card space-y-4 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-foreground">{t("ai.followUpTitle")}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{t("ai.followUpHint")}</p>
                </div>
                <Switch checked={s.follow_up_enabled} onCheckedChange={(v) => set("follow_up_enabled", v)} disabled={!canManage} aria-label={t("ai.followUpTitle")} />
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="space-y-1.5"><Label>{t("ai.field.follow_up_delay_hours")}</Label>{num("follow_up_delay_hours", 1, 168)}</div>
                <div className="space-y-1.5"><Label>{t("ai.field.follow_up_max")}</Label>{num("follow_up_max", 0, 5)}</div>
                <div className="space-y-1.5"><Label>{t("ai.field.allowed_hours_start")}</Label>{num("allowed_hours_start", 0, 23)}</div>
                <div className="space-y-1.5"><Label>{t("ai.field.allowed_hours_end")}</Label>{num("allowed_hours_end", 1, 24)}</div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tz">{t("ai.field.timezone")}</Label>
                <Input id="tz" dir="ltr" value={s.timezone} disabled={!canManage} onChange={(e) => set("timezone", e.target.value)} />
              </div>
            </section>

            {canManage && (
              <div className="flex justify-end">
                <Button variant="glow" onClick={save} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />} {t("common.save")}
                </Button>
              </div>
            )}
            </>
            )}
          </div>

          <Playground clientId={selectedClient.id} />
        </div>
      )}
    </DashboardLayout>
  );
};

function Playground({ clientId }: { clientId: string }) {
  const { t } = useTranslation("features");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [text, setText] = useState("");
  const [role, setRole] = useState<ChatMsg["role"]>("lead");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!text.trim()) return;
    const next = [...messages, { role, text: text.trim() }];
    setMessages(next);
    setText("");
    if (role !== "lead") return;
    setBusy(true);
    try {
      const d = await invokeFn<Verdict>("ai-agent", { clientId, dryRun: true, messages: next });
      setVerdict(d);
      if (d.reply) setMessages((m) => [...m, { role: "business", text: d.reply! }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass-card flex h-fit flex-col p-6 xl:col-span-2">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-foreground">{t("ai.playground")}</h2>
        <Button variant="ghost" size="icon" aria-label={t("ai.clear")} onClick={() => { setMessages([]); setVerdict(null); }}>
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t("ai.playgroundHint")}</p>

      <div className="mt-4 min-h-[240px] max-h-[420px] space-y-2 overflow-y-auto rounded-lg bg-background/40 p-3">
        {messages.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">{t("ai.playgroundEmpty")}</p>}
        {messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "business" ? "justify-end" : "justify-start")}>
            <p className={cn("max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm", m.role === "business" ? "bg-primary/15" : "bg-secondary")}>
              {m.text}
            </p>
          </div>
        ))}
        {busy && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
      </div>

      {verdict && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className={cn("rounded-full px-2 py-0.5", verdict.is_spam ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success")}>
            {verdict.is_spam ? t("ai.verdict.spam") : t("ai.verdict.notSpam")}
          </span>
          {verdict.qualification && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-primary">{t(`ai.verdict.${verdict.qualification}`)}</span>}
          {verdict.handoff && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-warning">{t("ai.verdict.handoff")}</span>}
          {verdict.products?.map((n) => <span key={n} className="rounded-full bg-accent/15 px-2 py-0.5 text-accent-foreground">📷 {n}</span>)}
          {verdict.reason && <span className="w-full text-muted-foreground">{verdict.reason}</span>}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => setRole((r) => (r === "lead" ? "business" : "lead"))}
          title={t("ai.switchRole")}
        >
          {role === "lead" ? t("ai.asLead") : t("ai.asBusiness")}
        </Button>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !busy && send()}
          placeholder={t("ai.typeMessage")}
        />
        <Button size="icon" onClick={send} disabled={busy || !text.trim()} aria-label={t("ai.send")}>
          <Send className="w-4 h-4 rtl:-scale-x-100" />
        </Button>
      </div>
    </section>
  );
}

export default AIAgent;
