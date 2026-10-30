import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DateRangePicker, DateRange, getDefaultDateRange } from "@/components/dashboard/DateRangePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, Info, Loader2, RefreshCw } from "lucide-react";
import { useAgency } from "@/hooks/useAgency";
import { supabase } from "@/integrations/supabase/client";
import { ratio, useFunnel } from "@/components/campaigns/useFunnel";
import { invokeFn, useFormat } from "@/components/leads/shared";
import { PlatformChip } from "@/components/leads/badges";

type PlatformFilter = "all" | "tiktok" | "meta";

const Campaigns = () => {
  const { t } = useTranslation("features");
  const f = useFormat();
  const navigate = useNavigate();
  const { selectedClient } = useAgency();
  const [range, setRange] = useState<DateRange>(getDefaultDateRange());
  const [platform, setPlatform] = useState<PlatformFilter>("all");
  const [syncing, setSyncing] = useState(false);
  const { rows, totals, loading, reload } = useFunnel(selectedClient?.id, range);

  const visible = useMemo(() => rows.filter((r) => platform === "all" || r.platform === platform), [rows, platform]);

  const sync = async () => {
    if (!selectedClient) return;
    setSyncing(true);
    try {
      const d = await invokeFn<{ campaigns?: unknown[] }>("tiktok-oauth", {
        action: "fetch-campaigns",
        clientId: selectedClient.id,
        dateFrom: range.from.toISOString().split("T")[0],
        dateTo: range.to.toISOString().split("T")[0],
      });
      toast.success(t("campaigns.synced", { count: d.campaigns?.length ?? 0 }));
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("campaigns.syncFailed"));
    } finally {
      setSyncing(false);
    }
  };

  const cell = (v: number | null, money = true) => (v === null ? "—" : money ? f.money(v, "USD") : f.num(v));

  return (
    <DashboardLayout title={t("campaigns.title")} subtitle={t("campaigns.subtitle")}>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <DateRangePicker value={range} onChange={setRange} />
        <Select value={platform} onValueChange={(v) => setPlatform(v as PlatformFilter)}>
          <SelectTrigger className="w-[150px] bg-secondary border-border"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("campaigns.allPlatforms")}</SelectItem>
            <SelectItem value="tiktok">{t("platform.tiktok")}</SelectItem>
            <SelectItem value="meta">{t("platform.meta")}</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" className="ms-auto" onClick={sync} disabled={!selectedClient || syncing}>
          <RefreshCw className={syncing ? "w-4 h-4 animate-spin" : "w-4 h-4"} />
          {t("campaigns.syncNow")}
        </Button>
      </div>

      {!selectedClient ? (
        <div className="glass-card wob-mesh-card p-12 text-center text-muted-foreground">{t("common.selectClient")}</div>
      ) : loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              [t("campaigns.costPerQualified"), cell(ratio(totals.spend, totals.qualified))],
              [t("campaigns.costPerClient"), cell(ratio(totals.spend, totals.clients))],
              [t("campaigns.revenue"), f.money(totals.revenue, totals.currency)],
              [t("campaigns.spend"), f.money(totals.spend, "USD")],
            ].map(([label, value]) => (
              <div key={label} className="glass-card p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-xl font-bold text-foreground">{value}</p>
              </div>
            ))}
          </div>

          {platform !== "tiktok" &&
            rows.some((r) => r.platform === "meta") &&
            !rows.some((r) => r.platform === "meta" && r.spend > 0) && (
              <p className="mb-6 flex items-start gap-2 rounded-lg border border-border bg-secondary/40 p-3 text-sm text-muted-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>
                  {t("campaigns.metaSpendHint")}{" "}
                  <button type="button" className="text-primary underline" onClick={() => navigate("/connections")}>
                    {t("campaigns.goConnections")}
                  </button>
                </span>
              </p>
            )}

          {visible.length === 0 ? (
            <div className="glass-card wob-mesh-card p-10 text-center">
              <p className="text-foreground font-medium">{t("campaigns.empty")}</p>
              <p className="text-sm text-muted-foreground mt-1">{t("campaigns.emptyHint")}</p>
              <Button className="mt-4" onClick={() => navigate("/connections")}>{t("campaigns.goConnections")}</Button>
            </div>
          ) : (
            <div className="glass-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      {["campaign", "spend", "clicks", "real", "qualified", "clients", "costPerQualified", "costPerClient", "revenue", "roas"].map((k) => (
                        <th key={k} className="text-start whitespace-nowrap">{t(`campaigns.col.${k}`)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r) => (
                      <tr key={r.key}>
                        <td>
                          <div className="flex items-center gap-2">
                            <PlatformChip platform={r.platform} />
                            <span className="font-medium text-foreground">{r.name}</span>
                          </div>
                        </td>
                        <td>{f.money(r.spend, "USD")}</td>
                        <td>{f.num(r.clicks)}</td>
                        <td>{f.num(r.real)}</td>
                        <td>{f.num(r.qualified)}</td>
                        <td className="font-semibold text-success">{f.num(r.clients)}</td>
                        <td>{cell(ratio(r.spend, r.qualified))}</td>
                        <td className="text-primary font-semibold">{cell(ratio(r.spend, r.clients))}</td>
                        <td>{f.money(r.revenue, totals.currency)}</td>
                        {/* ponytail: ROAS mixes revenue currency with ad-spend currency; add FX when accounts bill in different currencies. */}
                        <td>{r.spend > 0 ? `${(r.revenue / r.spend).toFixed(2)}×` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <AttributionHelp clientId={selectedClient.id} />
        </>
      )}
    </DashboardLayout>
  );
};

function AttributionHelp({ clientId }: { clientId: string }) {
  const { t } = useTranslation("features");
  const [numbers, setNumbers] = useState<{ id: string; phone_number: string }[]>([]);
  const [numberId, setNumberId] = useState<string>("");
  const [text, setText] = useState(() => t("campaigns.help.defaultText"));

  useEffect(() => {
    supabase.from("whatsapp_numbers").select("id, phone_number").eq("client_id", clientId).eq("status", "connected")
      .then(({ data }) => {
        setNumbers(data ?? []);
        setNumberId(data?.[0]?.id ?? "");
      });
  }, [clientId]);

  const digits = numbers.find((n) => n.id === numberId)?.phone_number.replace(/\D/g, "") ?? "";
  // TikTok substitutes __CLICKID__ in destination URLs; the webhook parses "ttclid=<id>" out of the first message.
  const link = digits ? `https://wa.me/${digits}?text=${encodeURIComponent(`${text} ttclid=__CLICKID__`)}` : "";

  return (
    <div className="glass-card mt-6 p-6">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <Info className="w-5 h-5 text-primary" /> {t("campaigns.help.title")}
      </h3>
      <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
        <li><span className="font-medium text-foreground">{t("platform.meta")}:</span> {t("campaigns.help.meta")}</li>
        <li><span className="font-medium text-foreground">{t("platform.tiktok")}:</span> {t("campaigns.help.tiktok")}</li>
      </ul>
      {numbers.length === 0 ? (
        <p className="mt-4 text-sm text-warning">{t("campaigns.help.noNumber")}</p>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {numbers.length > 1 && (
              <Select value={numberId} onValueChange={setNumberId}>
                <SelectTrigger className="w-[200px] bg-secondary border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {numbers.map((n) => <SelectItem key={n.id} value={n.id}>{n.phone_number}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Input className="flex-1 min-w-[220px]" value={text} onChange={(e) => setText(e.target.value)} aria-label={t("campaigns.help.textLabel")} />
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-secondary/60 p-3">
            <code className="flex-1 break-all text-xs text-foreground" dir="ltr">{link}</code>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t("common.copy")}
              onClick={() => navigator.clipboard.writeText(link).then(() => toast.success(t("common.copied")))}
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("campaigns.help.verify")}</p>
        </div>
      )}
    </div>
  );
}

export default Campaigns;
