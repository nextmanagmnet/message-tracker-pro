import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { db, invokeFn } from "@/components/leads/shared";

const MAX_CHARS = 1500;

type Tone = { tone_profile: string | null; tone_sample_size: number | null; tone_updated_at: string | null };
type LearnResult = ({ status: "learned" } & Tone) | { status: "not_enough"; count: number; needed: number };

// "Your tone" — the style the AI agent copies, learned from the owner's own WhatsApp replies.
export function ToneCard({ clientId, canManage }: { clientId: string; canManage: boolean }) {
  const { t, i18n } = useTranslation("tone");
  const [tone, setTone] = useState<Tone>({ tone_profile: null, tone_sample_size: null, tone_updated_at: null });
  const [draft, setDraft] = useState("");
  const [learning, setLearning] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    db.from("ai_agent_settings")
      .select("tone_profile, tone_sample_size, tone_updated_at")
      .eq("client_id", clientId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setTone(data);
        setDraft(data?.tone_profile ?? "");
      });
  }, [clientId]);

  const learn = async () => {
    setLearning(true);
    try {
      const r = await invokeFn<LearnResult>("ai-agent", { clientId, action: "learn-tone" });
      if (r.status === "not_enough") {
        toast.info(t("notEnough", { count: r.count, needed: r.needed }));
        return;
      }
      setTone(r);
      setDraft(r.tone_profile ?? "");
      toast.success(t("learned"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("learnFailed"));
    } finally {
      setLearning(false);
    }
  };

  const save = async () => {
    setSaving(true);
    const tone_profile = draft.trim() || null;
    const { error } = await db
      .from("ai_agent_settings")
      .upsert({ client_id: clientId, tone_profile }, { onConflict: "client_id" });
    setSaving(false);
    if (error) return toast.error(t("saveFailed"));
    setTone((p) => ({ ...p, tone_profile }));
    toast.success(t("saved"));
  };

  const learned = Boolean(tone.tone_profile);
  const dirty = draft.trim() !== (tone.tone_profile ?? "");

  return (
    <section className="glass-card space-y-3 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-foreground">
            <Sparkles className="h-5 w-5 text-primary" /> {t("title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {learned && tone.tone_updated_at
              ? t("status", {
                  count: tone.tone_sample_size ?? 0,
                  date: new Date(tone.tone_updated_at).toLocaleDateString(i18n.language),
                })
              : t("notLearned")}
          </p>
        </div>
        {canManage && (
          <Button variant="outline" size="sm" className="shrink-0" onClick={learn} disabled={learning}>
            {learning && <Loader2 className="h-4 w-4 animate-spin" />} {learned ? t("relearn") : t("learn")}
          </Button>
        )}
      </div>
      {(learned || canManage) && (
        <Textarea
          rows={8}
          value={draft}
          maxLength={MAX_CHARS}
          disabled={!canManage}
          placeholder={t("placeholder")}
          aria-label={t("title")}
          onChange={(e) => setDraft(e.target.value)}
        />
      )}
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">{t("privacy")}</p>
        {canManage && dirty && (
          <Button size="sm" onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} {t("save")}
          </Button>
        )}
      </div>
    </section>
  );
}
