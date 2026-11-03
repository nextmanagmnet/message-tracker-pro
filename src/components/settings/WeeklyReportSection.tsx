import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CalendarClock, Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAgency } from "@/hooks/useAgency";
import { invokeFn } from "@/components/leads/shared";

type Form = { enabled: boolean; phone: string; language: "en" | "ar"; weekday: number; hour: number; timezone: string };

const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const DEFAULTS: Form = { enabled: false, phone: "", language: "en", weekday: 1, hour: 9, timezone: browserTz };

// Same rule as the database check: optional +, 8–15 digits (spaces/dashes are stripped).
const cleanPhone = (p: string) => p.replace(/[\s\-().]/g, "");
const validPhone = (p: string) => /^\+?[1-9][0-9]{7,14}$/.test(cleanPhone(p));
const validTz = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

// Weekly WhatsApp summary to the business owner, for the selected client.
export function WeeklyReportSection() {
  const { t, i18n } = useTranslation("weekly");
  const { selectedClient, canManage } = useAgency();
  const clientId = selectedClient?.id;
  const [form, setForm] = useState<Form>(DEFAULTS);
  const [saved, setSaved] = useState(JSON.stringify(DEFAULTS));
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    setPreview(null);
    supabase
      .from("weekly_report_settings")
      .select("enabled, phone, language, weekday, hour, timezone, last_sent_at")
      .eq("client_id", clientId)
      .maybeSingle()
      .then(({ data }) => {
        const next: Form = data
          ? {
              enabled: data.enabled,
              phone: data.phone ?? "",
              language: data.language === "ar" ? "ar" : "en",
              weekday: data.weekday,
              hour: data.hour,
              timezone: data.timezone,
            }
          : DEFAULTS;
        setForm(next);
        setSaved(JSON.stringify(next));
        setLastSent(data?.last_sent_at ?? null);
      });
  }, [clientId]);

  if (!clientId) return null;

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const locale = i18n.language === "ar" ? "ar" : "en-US";
  const weekdays = Array.from({ length: 7 }, (_, d) =>
    // 2026-11-01 is a Sunday, so day d of that week has weekday index d.
    new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 10, 1 + d))),
  );

  const save = async () => {
    if (form.enabled && !form.phone.trim()) return toast.error(t("phoneRequired"));
    if (form.phone.trim() && !validPhone(form.phone)) return toast.error(t("phoneInvalid"));
    if (!validTz(form.timezone)) return toast.error(t("timezoneInvalid"));
    setSaving(true);
    const phone = form.phone.trim() ? cleanPhone(form.phone) : null;
    const { error } = await supabase.from("weekly_report_settings").upsert({
      client_id: clientId,
      enabled: form.enabled,
      phone,
      language: form.language,
      weekday: form.weekday,
      hour: form.hour,
      timezone: form.timezone,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) return toast.error(t("error"));
    const next = { ...form, phone: phone ?? "" };
    setForm(next);
    setSaved(JSON.stringify(next));
    toast.success(t("saved"));
  };

  const runPreview = async () => {
    setPreviewing(true);
    try {
      const { text } = await invokeFn<{ text: string }>("weekly-report", {
        action: "preview",
        clientId,
        language: form.language,
        timezone: validTz(form.timezone) ? form.timezone : undefined,
      });
      setPreview(text);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error"));
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <div className="glass-card p-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="p-3 rounded-xl bg-primary/10">
          <CalendarClock className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">{t("title")}</h3>
          <p className="text-sm text-muted-foreground">{t("subtitle", { client: selectedClient.name })}</p>
        </div>
      </div>

      <fieldset disabled={!canManage} className="space-y-4">
        <label className="flex items-center justify-between gap-4 p-4 rounded-lg bg-secondary/50 cursor-pointer">
          <span className="text-sm font-medium text-foreground">{t("enable")}</span>
          <Switch checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} disabled={!canManage} />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="weekly-phone">{t("phone")}</Label>
            <Input
              id="weekly-phone"
              dir="ltr"
              type="tel"
              inputMode="tel"
              placeholder="+9665XXXXXXXX"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("phoneHint")}</p>
          </div>
          <div className="space-y-1">
            <Label>{t("language")}</Label>
            <Select value={form.language} onValueChange={(v) => set("language", v === "ar" ? "ar" : "en")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ar">العربية</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t("weekday")}</Label>
            <Select value={String(form.weekday)} onValueChange={(v) => set("weekday", Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {weekdays.map((name, d) => (
                  <SelectItem key={d} value={String(d)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t("hour")}</Label>
            <Select value={String(form.hour)} onValueChange={(v) => set("hour", Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 24 }, (_, h) => (
                  <SelectItem key={h} value={String(h)}>
                    <span dir="ltr">{`${String(h).padStart(2, "0")}:00`}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="weekly-tz">{t("timezone")}</Label>
            <Input
              id="weekly-tz"
              dir="ltr"
              value={form.timezone}
              onChange={(e) => set("timezone", e.target.value.trim())}
            />
            <p className="text-xs text-muted-foreground">{t("timezoneHint", { tz: browserTz })}</p>
          </div>
        </div>
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {canManage && (
          <Button onClick={save} disabled={saving || JSON.stringify(form) === saved}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {t("save")}
          </Button>
        )}
        <Button variant="outline" onClick={runPreview} disabled={previewing}>
          {previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
          {t("preview")}
        </Button>
        <span className="ms-auto text-xs text-muted-foreground">
          {lastSent
            ? t("lastSent", { date: new Date(lastSent).toLocaleString(i18n.language === "ar" ? "ar" : "en-US") })
            : t("neverSent")}
        </span>
      </div>
      {!canManage && <p className="mt-2 text-xs text-muted-foreground">{t("adminsOnly")}</p>}

      {preview && (
        <pre
          dir={form.language === "ar" ? "rtl" : "ltr"}
          className="mt-4 whitespace-pre-wrap rounded-lg bg-secondary/50 p-4 text-sm text-foreground font-sans"
        >
          {preview}
        </pre>
      )}
    </div>
  );
}
