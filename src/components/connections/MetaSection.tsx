import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, Unplug, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invokeFn, isLimitError } from "@/components/leads/shared";
import { ConnectionCard } from "./ConnectionCard";

type Status = {
  connected: boolean;
  pixelId: string | null;
  pixelName: string | null;
  adAccountId: string | null;
  adAccountName: string | null;
  hasAdsToken: boolean;
};

const mask = (s: string) => (s.length <= 4 ? s : `•••• ${s.slice(-4)}`);

export function MetaSection({ clientId, canManage }: { clientId: string; canManage: boolean }) {
  const { t } = useTranslation("features");
  const [status, setStatus] = useState<Status | null>(null);
  const [pixelId, setPixelId] = useState("");
  const [capiToken, setCapiToken] = useState("");
  const [adAccountId, setAdAccountId] = useState("");
  const [adsToken, setAdsToken] = useState("");
  const [busy, setBusy] = useState<"pixel" | "ads" | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await invokeFn<Status>("meta-connect", { action: "status", clientId }));
    } catch (e) {
      console.error("meta status failed", e);
      setStatus({ connected: false, pixelId: null, pixelName: null, adAccountId: null, adAccountName: null, hasAdsToken: false });
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const fail = (e: unknown) => toast.error(isLimitError(e) ? t("limits.meta") : e instanceof Error ? e.message : t("common.error"));

  const savePixel = async () => {
    if (!pixelId.trim() || !capiToken.trim()) return toast.error(t("connections.meta.pixelRequired"));
    setBusy("pixel");
    try {
      await invokeFn("meta-connect", { action: "save-pixel", clientId, pixelId, capiToken });
      toast.success(t("connections.meta.pixelSaved"));
      setPixelId("");
      setCapiToken("");
      load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const saveAds = async () => {
    if (!adAccountId.trim() || !adsToken.trim()) return toast.error(t("connections.meta.adsRequired"));
    setBusy("ads");
    try {
      await invokeFn("meta-connect", { action: "save-ads", clientId, adAccountId, adsToken });
      toast.success(t("connections.meta.adsSaved"));
      setAdAccountId("");
      setAdsToken("");
      load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const testEvent = async () => {
    const code = window.prompt(t("connections.meta.testPrompt"));
    if (code === null) return;
    try {
      const d = await invokeFn<{ accepted?: boolean; message?: string | null }>("meta-connect", {
        action: "test-event",
        clientId,
        testEventCode: code,
      });
      if (d.accepted) toast.success(t("connections.meta.testAccepted"));
      else toast.error(t("connections.meta.testRejected", { message: d.message ?? "" }));
    } catch (e) {
      fail(e);
    }
  };

  const disconnect = async (part: "ads" | "all") => {
    if (!window.confirm(t(part === "all" ? "connections.meta.confirmDisconnect" : "connections.meta.confirmAdsDisconnect"))) return;
    try {
      await invokeFn("meta-connect", { action: "disconnect", clientId, part });
      toast.success(t(part === "all" ? "connections.meta.disconnected" : "connections.meta.adsDisconnected"));
      load();
    } catch (e) {
      fail(e);
    }
  };

  const connected = status === null ? null : status.connected;

  return (
    <ConnectionCard
      icon={<span className="text-lg font-bold">f</span>}
      accent="bg-gradient-to-br from-chart-4 to-chart-6"
      title={t("connections.meta.title")}
      description={t("connections.meta.description")}
      connected={connected}
      actions={
        status?.connected &&
        canManage && (
          <>
            <Button variant="outline" size="sm" onClick={testEvent}>
              <Zap className="w-4 h-4" /> {t("connections.meta.testEvent")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => disconnect("all")}>
              <Unplug className="w-4 h-4" /> {t("whatsapp.disconnect")}
            </Button>
          </>
        )
      }
    >
      {status?.connected && status.pixelId && (
        <dl className="mb-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-lg bg-secondary/50 px-3 py-2">
            <dt className="text-xs text-muted-foreground">{t("connections.meta.pixel")}</dt>
            <dd className="text-foreground">
              {status.pixelName ?? "—"} <span className="text-xs text-muted-foreground" dir="ltr">{mask(status.pixelId)}</span>
            </dd>
          </div>
          <div className="rounded-lg bg-secondary/50 px-3 py-2">
            <dt className="text-xs text-muted-foreground">{t("connections.meta.capiToken")}</dt>
            <dd className="text-success">{t("connections.meta.tokenSaved")}</dd>
          </div>
        </dl>
      )}

      {canManage && (
        <div className="space-y-3">
          <ol className="list-decimal space-y-1 ps-5 text-xs text-muted-foreground">
            <li>{t("connections.meta.help.step1")}</li>
            <li>{t("connections.meta.help.step2")}</li>
            <li>{t("connections.meta.help.step3")}</li>
          </ol>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="meta-pixel">{t("connections.meta.pixelId")}</Label>
              <Input id="meta-pixel" dir="ltr" inputMode="numeric" value={pixelId} onChange={(e) => setPixelId(e.target.value)} placeholder="1234567890123456" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="meta-capi">{t("connections.meta.capiToken")}</Label>
              <Input id="meta-capi" dir="ltr" type="password" autoComplete="off" value={capiToken} onChange={(e) => setCapiToken(e.target.value)} placeholder="EAA…" />
            </div>
          </div>
          <Button onClick={savePixel} disabled={busy === "pixel"}>
            {busy === "pixel" && <Loader2 className="w-4 h-4 animate-spin" />}
            {status?.connected ? t("connections.meta.updatePixel") : t("connections.meta.savePixel")}
          </Button>
        </div>
      )}

      <details className="mt-5 rounded-lg border border-border p-3" open={status?.hasAdsToken || undefined}>
        <summary className="cursor-pointer text-sm font-medium text-foreground">{t("connections.meta.adsTitle")}</summary>
        <p className="mt-2 text-xs text-muted-foreground">{t("connections.meta.adsHint")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("connections.meta.adsHelp")}</p>
        {status?.hasAdsToken && (
          <div className="mt-3 flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2 text-sm">
            <span className="text-foreground">
              {t("connections.meta.adsOn", { name: status.adAccountName ?? (status.adAccountId ? mask(status.adAccountId) : "") })}
            </span>
            {canManage && (
              <Button variant="ghost" size="sm" onClick={() => disconnect("ads")}>
                <Unplug className="w-4 h-4" /> {t("connections.meta.adsDisconnect")}
              </Button>
            )}
          </div>
        )}
        {canManage && (
          <div className="mt-3 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="meta-ad-account">{t("connections.meta.adAccountId")}</Label>
                <Input id="meta-ad-account" dir="ltr" value={adAccountId} onChange={(e) => setAdAccountId(e.target.value)} placeholder="act_1234567890" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="meta-ads-token">{t("connections.meta.adsToken")}</Label>
                <Input id="meta-ads-token" dir="ltr" type="password" autoComplete="off" value={adsToken} onChange={(e) => setAdsToken(e.target.value)} placeholder="EAA…" />
              </div>
            </div>
            <Button variant="outline" onClick={saveAds} disabled={busy === "ads"}>
              {busy === "ads" && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("connections.meta.saveAds")}
            </Button>
          </div>
        )}
      </details>
    </ConnectionCard>
  );
}
