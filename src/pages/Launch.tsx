import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, ArrowRight, Loader2, Plus, Rocket, Sparkles, Trash2 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAgency } from "@/hooks/useAgency";
import { supabase } from "@/integrations/supabase/client";
import { invokeFn, useFormat } from "@/components/leads/shared";
import { goLink } from "@/lib/goLink";
import { cn } from "@/lib/utils";
import {
  type Gender,
  type Launch as LaunchRow,
  MAX_TEXT,
  MIN_BUDGET,
  type Options,
  type Region,
  type Suggestion,
} from "@/components/launch/api";
import { LaunchStatus } from "@/components/launch/LaunchStatus";
import { MediaStep } from "@/components/launch/MediaStep";

const STEPS = ["target", "contact", "cta", "media", "text", "review"] as const;
type Step = (typeof STEPS)[number];
const MAX_ADS = 20;

type Draft = {
  launchId: string;
  name: string;
  country: string; // ISO code
  regionIds: string[]; // provinces/cities inside the country; empty = whole country
  ageMin: string;
  ageMax: string;
  gender: Gender;
  dailyBudget: string;
  startAt: string; // datetime-local; empty = now
  whatsappNumberId: string;
  message: string;
  goal: string;
  productId: string;
  cta: string;
  mediaIds: string[];
  texts: string[];
  identityId: string;
};

const newDraft = (): Draft => ({
  launchId: crypto.randomUUID(),
  name: "",
  country: "",
  regionIds: [],
  ageMin: "18",
  ageMax: "54",
  gender: "GENDER_UNLIMITED",
  dailyBudget: String(MIN_BUDGET),
  startAt: "",
  whatsappNumberId: "",
  message: "",
  goal: "",
  productId: "",
  cta: "CONTACT_US",
  mediaIds: [],
  texts: [""],
  identityId: "",
});

const Launch = () => {
  const { t, i18n } = useTranslation("launch");
  const f = useFormat();
  const navigate = useNavigate();
  const { selectedClient, canManage } = useAgency();
  const clientId = selectedClient?.id;
  const lang = i18n.language === "ar" ? "ar" : "en";

  const [options, setOptions] = useState<Options | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [countries, setCountries] = useState<Region[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionQuery, setRegionQuery] = useState("");
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [draft, setDraft] = useState<Draft>(newDraft);
  const [step, setStep] = useState<Step>("target");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<"ai" | "launch" | null>(null);
  const [result, setResult] = useState<LaunchRow | null>(null);

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  useEffect(() => {
    if (!clientId || !canManage) return;
    setOptions(null);
    setLoadError(null);
    setDraft(newDraft());
    setStep("target");
    setResult(null);
    invokeFn<Options>("tiktok-ads", { action: "options", clientId })
      .then((o) => {
        setOptions(o);
        setDraft((d) => ({
          ...d,
          whatsappNumberId: o.numbers[0]?.id ?? "",
          identityId: o.identities[0]?.id ?? "",
          country: o.country ?? "",
          name: `${selectedClient?.name ?? "WOB"} - WhatsApp - ${new Date().toISOString().slice(0, 10)}`,
        }));
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : t("error")));
    supabase
      .from("products")
      .select("id, name")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setProducts(data ?? []));
  }, [clientId, canManage, selectedClient?.name, t]);

  useEffect(() => {
    if (!clientId || !canManage) return;
    invokeFn<{ regions: Region[] }>("tiktok-ads", { action: "regions", clientId, language: lang })
      .then((d) => setCountries(d.regions))
      .catch(() => setCountries([]));
  }, [clientId, canManage, lang]);

  useEffect(() => {
    setRegions([]);
    if (!clientId || !draft.country) return;
    invokeFn<{ regions: Region[] }>("tiktok-ads", {
      action: "regions",
      clientId,
      country: draft.country,
      language: lang,
    })
      .then((d) => setRegions(d.regions))
      .catch(() => setRegions([]));
  }, [clientId, draft.country, lang]);

  const countryId = countries.find((c) => c.code === draft.country)?.id ?? "";
  const locationIds = draft.regionIds.length ? draft.regionIds : countryId ? [countryId] : [];
  const budget = Number(draft.dailyBudget);
  const maxBudget = options?.maxBudget ?? 500;
  const ageMin = Number(draft.ageMin);
  const ageMax = Number(draft.ageMax);
  const texts = draft.texts.map((x) => x.trim()).filter(Boolean);
  const adCount = draft.mediaIds.length * texts.length;
  const identity = options?.identities.find((i) => i.id === draft.identityId) ?? null;
  const number = options?.numbers.find((n) => n.id === draft.whatsappNumberId);
  const link = goLink(window.location.origin, number?.phone_number ?? "", draft.message, options?.pixel?.pixelCode);

  const valid: Record<Step, boolean> = {
    target:
      locationIds.length > 0 &&
      budget >= MIN_BUDGET &&
      budget <= maxBudget &&
      ageMin >= 18 &&
      ageMax <= 100 &&
      ageMin <= ageMax,
    contact: !!number && !!draft.message.trim(),
    cta: !!draft.cta,
    media: draft.mediaIds.length > 0,
    text:
      texts.length > 0 && draft.texts.every((x) => x.trim().length <= MAX_TEXT) && adCount <= MAX_ADS && adCount > 0,
    review: !!identity && !!draft.name.trim() && confirmed && !options?.reconnect.ads,
  };
  const index = STEPS.indexOf(step);
  const filteredRegions = useMemo(
    () => regions.filter((r) => r.name.toLowerCase().includes(regionQuery.toLowerCase())).slice(0, 200),
    [regions, regionQuery],
  );

  const suggest = async () => {
    if (!clientId) return;
    setBusy("ai");
    try {
      const { suggestion: s } = await invokeFn<{ suggestion: Suggestion }>("tiktok-ads", {
        action: "ai-suggest",
        clientId,
        goal: draft.goal,
        productId: draft.productId || undefined,
        language: lang,
      });
      const country = s.countryCode && countries.some((c) => c.code === s.countryCode) ? s.countryCode : draft.country;
      patch({
        texts: s.texts,
        message: s.message,
        gender: s.gender,
        ageMin: String(s.ageMin),
        ageMax: String(s.ageMax),
        ...(country !== draft.country ? { country, regionIds: [] } : {}),
      });
      toast.success(t("ai.done"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(null);
    }
  };

  const launch = async () => {
    if (!clientId || !identity || !valid.review) return;
    setBusy("launch");
    try {
      const d = await invokeFn<{ launch: LaunchRow }>("tiktok-ads", {
        action: "launch",
        clientId,
        confirm: true, // the user's explicit Launch click: ads go live after TikTok's review
        launchId: draft.launchId,
        name: draft.name.trim(),
        locationIds,
        ageMin,
        ageMax,
        gender: draft.gender,
        dailyBudget: budget,
        startAt: draft.startAt ? new Date(draft.startAt).toISOString() : null,
        whatsappNumberId: draft.whatsappNumberId,
        message: draft.message.trim(),
        cta: draft.cta,
        mediaIds: draft.mediaIds,
        texts,
        identity: { id: identity.id, type: identity.type, bcId: identity.bcId },
      });
      setResult(d.launch);
      toast.success(t("review.launched"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(null);
    }
  };

  const toggleMedia = (id: string) =>
    setDraft((d) => ({
      ...d,
      mediaIds: d.mediaIds.includes(id) ? d.mediaIds.filter((x) => x !== id) : [...d.mediaIds, id],
    }));

  const aiButton = (
    <Button variant="secondary" onClick={suggest} disabled={busy !== null}>
      {busy === "ai" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      {t("ai.suggest")}
    </Button>
  );

  const body = () => {
    if (!selectedClient)
      return <div className="glass-card wob-mesh-card p-12 text-center text-muted-foreground">{t("selectClient")}</div>;
    if (!canManage)
      return <div className="glass-card wob-mesh-card p-12 text-center text-muted-foreground">{t("adminsOnly")}</div>;
    if (loadError)
      return (
        <div className="glass-card wob-mesh-card p-10 text-center">
          <p className="text-foreground" dir="auto">
            {loadError}
          </p>
          <Button className="mt-4" onClick={() => navigate("/connections")}>
            {t("reconnect.action")}
          </Button>
        </div>
      );
    if (!options)
      return (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      );
    if (result)
      return (
        <div className="glass-card space-y-4 p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Rocket className="h-5 w-5 text-primary" />
            {result.status === "launched" ? t("result.launched") : t("result.failed")}
          </h2>
          {result.status === "launched" && <p className="text-sm text-muted-foreground">{t("result.reviewHint")}</p>}
          <LaunchStatus clientId={selectedClient.id} launch={result} onChange={setResult} />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate("/campaigns")}>
              {t("result.back")}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setResult(null);
                setConfirmed(false);
                setDraft({ ...draft, launchId: crypto.randomUUID(), mediaIds: [] });
                setStep("target");
              }}
            >
              <Plus className="h-4 w-4" /> {t("result.another")}
            </Button>
          </div>
        </div>
      );

    return (
      <div className="space-y-6">
        <ol className="flex flex-wrap gap-2" aria-label={t("steps.label")}>
          {STEPS.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => i <= index && setStep(s)}
                disabled={i > index}
                aria-current={s === step ? "step" : undefined}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition",
                  s === step
                    ? "bg-primary text-primary-foreground"
                    : i < index
                      ? "bg-primary/15 text-primary"
                      : "bg-secondary text-muted-foreground",
                )}
              >
                {i + 1}. {t(`steps.${s}`)}
              </button>
            </li>
          ))}
        </ol>

        <div className="glass-card space-y-5 p-6">
          <h2 className="text-lg font-semibold text-foreground">{t(`steps.${step}`)}</h2>

          {step === "target" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="country">{t("target.country")}</Label>
                <Select value={draft.country} onValueChange={(v) => patch({ country: v, regionIds: [] })}>
                  <SelectTrigger id="country" className="bg-secondary border-border">
                    <SelectValue placeholder={t("target.chooseCountry")} />
                  </SelectTrigger>
                  <SelectContent>
                    {countries.map((c) => (
                      <SelectItem key={c.id} value={c.code}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="gender">{t("target.gender")}</Label>
                <Select value={draft.gender} onValueChange={(v) => patch({ gender: v as Gender })}>
                  <SelectTrigger id="gender" className="bg-secondary border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["GENDER_UNLIMITED", "GENDER_FEMALE", "GENDER_MALE"] as const).map((g) => (
                      <SelectItem key={g} value={g}>
                        {t(`target.genders.${g}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {regions.length > 0 && (
                <fieldset className="space-y-2 sm:col-span-2">
                  <legend className="text-sm font-medium text-foreground">{t("target.cities")}</legend>
                  <Input
                    value={regionQuery}
                    onChange={(e) => setRegionQuery(e.target.value)}
                    placeholder={t("target.searchCities")}
                    aria-label={t("target.searchCities")}
                  />
                  <div className="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto rounded-lg border border-border p-2 sm:grid-cols-2">
                    {filteredRegions.map((r) => (
                      <label key={r.id} className="flex items-center gap-2 text-sm text-foreground">
                        <Checkbox
                          checked={draft.regionIds.includes(r.id)}
                          onCheckedChange={(on) =>
                            patch({
                              regionIds: on ? [...draft.regionIds, r.id] : draft.regionIds.filter((x) => x !== r.id),
                            })
                          }
                        />
                        {r.name}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{t("target.citiesHint")}</p>
                </fieldset>
              )}
              <div className="space-y-2">
                <Label>{t("target.age")}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={18}
                    max={100}
                    value={draft.ageMin}
                    onChange={(e) => patch({ ageMin: e.target.value })}
                    aria-label={t("target.ageMin")}
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    type="number"
                    min={18}
                    max={100}
                    value={draft.ageMax}
                    onChange={(e) => patch({ ageMax: e.target.value })}
                    aria-label={t("target.ageMax")}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="budget">{t("target.budget")}</Label>
                <Input
                  id="budget"
                  type="number"
                  min={MIN_BUDGET}
                  max={maxBudget}
                  value={draft.dailyBudget}
                  onChange={(e) => patch({ dailyBudget: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  {t("target.budgetHint", {
                    min: f.money(MIN_BUDGET, options.balance?.currency),
                    max: f.money(maxBudget, options.balance?.currency),
                  })}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="start">{t("target.start")}</Label>
                <Input
                  id="start"
                  type="datetime-local"
                  value={draft.startAt}
                  onChange={(e) => patch({ startAt: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">{t("target.startHint")}</p>
              </div>
            </div>
          )}

          {step === "contact" && (
            <div className="space-y-4">
              {options.numbers.length === 0 ? (
                <p className="text-sm text-warning">
                  {t("contact.noNumber")}{" "}
                  <Link to="/connections" className="text-primary underline">
                    {t("reconnect.action")}
                  </Link>
                </p>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="number">{t("contact.number")}</Label>
                  <Select value={draft.whatsappNumberId} onValueChange={(v) => patch({ whatsappNumberId: v })}>
                    <SelectTrigger id="number" className="bg-secondary border-border sm:w-72">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {options.numbers.map((n) => (
                        <SelectItem key={n.id} value={n.id}>
                          <span dir="ltr">{n.phone_number}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-3 rounded-lg border border-border p-4">
                <p className="text-sm text-muted-foreground">{t("ai.intro")}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    value={draft.goal}
                    onChange={(e) => patch({ goal: e.target.value })}
                    placeholder={t("ai.goal")}
                    aria-label={t("ai.goal")}
                    dir="auto"
                  />
                  {products.length > 0 && (
                    <Select value={draft.productId} onValueChange={(v) => patch({ productId: v })}>
                      <SelectTrigger className="bg-secondary border-border" aria-label={t("ai.product")}>
                        <SelectValue placeholder={t("ai.product")} />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                {aiButton}
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">{t("contact.message")}</Label>
                <Textarea
                  id="message"
                  value={draft.message}
                  maxLength={300}
                  onChange={(e) => patch({ message: e.target.value })}
                  dir="auto"
                />
                <p className="text-xs text-muted-foreground">{t("contact.messageHint")}</p>
              </div>
              {link && (
                <p className="break-all rounded-lg bg-secondary/60 p-3 text-xs text-muted-foreground">
                  {t("contact.link")}{" "}
                  <code className="text-foreground" dir="ltr">
                    {link}
                  </code>
                </p>
              )}
              {options.pixelError && (
                <p className="text-xs text-warning" dir="auto">
                  {options.pixelError}
                </p>
              )}
            </div>
          )}

          {step === "cta" && (
            <div role="radiogroup" aria-label={t("steps.cta")} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {options.ctas.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={draft.cta === c}
                  onClick={() => patch({ cta: c })}
                  className={cn(
                    "rounded-lg border p-3 text-sm font-medium transition",
                    draft.cta === c
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-foreground hover:border-primary/50",
                  )}
                >
                  {t(`cta.${c}`, { defaultValue: c })}
                </button>
              ))}
            </div>
          )}

          {step === "media" && selectedClient && (
            <MediaStep
              clientId={selectedClient.id}
              options={options}
              selected={draft.mediaIds}
              onToggle={toggleMedia}
            />
          )}

          {step === "text" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {aiButton}
                <span className="text-xs text-muted-foreground">{t("text.count", { ads: adCount, max: MAX_ADS })}</span>
              </div>
              {draft.texts.map((x, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="flex-1">
                    <Input
                      value={x}
                      maxLength={MAX_TEXT}
                      onChange={(e) => patch({ texts: draft.texts.map((y, j) => (j === i ? e.target.value : y)) })}
                      aria-label={t("text.label", { n: i + 1 })}
                      dir="auto"
                    />
                    <p className="mt-1 text-end text-xs text-muted-foreground">
                      {x.length}/{MAX_TEXT}
                    </p>
                  </div>
                  {draft.texts.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("text.remove")}
                      onClick={() => patch({ texts: draft.texts.filter((_, j) => j !== i) })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {draft.texts.length < 5 && (
                <Button variant="outline" size="sm" onClick={() => patch({ texts: [...draft.texts, ""] })}>
                  <Plus className="h-4 w-4" /> {t("text.add")}
                </Button>
              )}
            </div>
          )}

          {step === "review" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t("review.name")}</Label>
                <Input
                  id="name"
                  value={draft.name}
                  maxLength={100}
                  onChange={(e) => patch({ name: e.target.value })}
                  dir="auto"
                />
              </div>
              {options.reconnect.ads && (
                <p className="flex items-start gap-2 text-sm text-warning">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {t("reconnect.ads")}{" "}
                    <Link to="/connections" className="text-primary underline">
                      {t("reconnect.action")}
                    </Link>
                  </span>
                </p>
              )}
              {options.identities.length === 0 ? (
                <p className="flex items-start gap-2 text-sm text-warning">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {t("reconnect.identity")}{" "}
                    <Link to="/connections" className="text-primary underline">
                      {t("reconnect.action")}
                    </Link>
                  </span>
                </p>
              ) : (
                options.identities.length > 1 && (
                  <div className="space-y-2">
                    <Label htmlFor="identity">{t("review.identity")}</Label>
                    <Select value={draft.identityId} onValueChange={(v) => patch({ identityId: v })}>
                      <SelectTrigger id="identity" className="bg-secondary border-border sm:w-72">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {options.identities.map((i) => (
                          <SelectItem key={i.id} value={i.id}>
                            {i.name ?? i.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )
              )}
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {[
                  [
                    t("target.country"),
                    `${countries.find((c) => c.code === draft.country)?.name ?? "—"}${
                      draft.regionIds.length ? ` (${t("review.cities", { n: draft.regionIds.length })})` : ""
                    }`,
                  ],
                  [t("target.age"), `${ageMin}–${ageMax} · ${t(`target.genders.${draft.gender}`)}`],
                  [t("target.budget"), f.money(budget, options.balance?.currency)],
                  [t("target.start"), draft.startAt ? f.date(new Date(draft.startAt).toISOString()) : t("review.now")],
                  [t("contact.number"), number?.phone_number ?? "—"],
                  [t("steps.cta"), t(`cta.${draft.cta}`, { defaultValue: draft.cta })],
                  [t("review.ads"), String(adCount)],
                  [t("contact.message"), draft.message],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 border-b border-border/50 py-1">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-end font-medium text-foreground" dir="auto">
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>
              {options.balance && (
                <p
                  className={cn(
                    "rounded-lg p-3 text-sm",
                    options.balance.amount < budget ? "bg-warning/10 text-foreground" : "bg-secondary/50",
                  )}
                >
                  {t("review.balance", { amount: f.money(options.balance.amount, options.balance.currency) })}
                  {options.balance.amount < budget && (
                    <>
                      {" "}
                      {t("review.lowBalance")}{" "}
                      <Link to="/funding" className="text-primary underline">
                        {t("review.addFunds")}
                      </Link>
                    </>
                  )}
                </p>
              )}
              <label className="flex items-start gap-2 text-sm text-foreground">
                <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} className="mt-0.5" />
                {t("review.confirm", { amount: f.money(budget, options.balance?.currency) })}
              </label>
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="outline" onClick={() => setStep(STEPS[index - 1])} disabled={index === 0}>
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t("steps.back")}
          </Button>
          {step === "review" ? (
            <Button variant="glow" onClick={launch} disabled={!valid.review || busy !== null}>
              {busy === "launch" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              {t("review.launch")}
            </Button>
          ) : (
            <Button onClick={() => setStep(STEPS[index + 1])} disabled={!valid[step]}>
              {t("steps.next")} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <DashboardLayout title={t("title")} subtitle={t("subtitle")}>
      {body()}
    </DashboardLayout>
  );
};

export default Launch;
