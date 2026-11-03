import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Loader2, Unplug, Zap } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { invokeFn, isLimitError } from "@/components/leads/shared";
import { TikTokBalanceCard } from "@/components/tiktok/TikTokBalanceCard";
import { ConnectionCard } from "./ConnectionCard";
import { beginOAuth, TIKTOK_KEY } from "./oauth";

type Account = { id: string; advertiser_id: string; advertiser_name: string | null };

export function TikTokSection({
  clientId,
  isIndividual,
  canManage,
  autoStart,
}: {
  clientId: string;
  isIndividual: boolean;
  canManage: boolean;
  autoStart: boolean;
}) {
  const { t } = useTranslation("features");
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [pixelId, setPixelId] = useState<string | null>(null);
  const [pixelCode, setPixelCode] = useState("");
  const [savingPixel, setSavingPixel] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [settingUp, setSettingUp] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const triedSetup = useRef(false);

  const load = useCallback(async () => {
    const [a, p] = await Promise.all([
      supabase.from("tiktok_accounts").select("id, advertiser_id, advertiser_name").eq("client_id", clientId),
      supabase.from("tiktok_pixels").select("id, pixel_code").eq("client_id", clientId).maybeSingle(),
    ]);
    setAccounts(a.data ?? []);
    setPixelId(p.data?.id ?? null);
    setPixelCode(p.data?.pixel_code ?? "");
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const setupTracking = useCallback(async () => {
    setSettingUp(true);
    setSetupError(null);
    try {
      const d = await invokeFn<{ pixelCode?: string; error?: string }>("tiktok-oauth", {
        action: "ensure-pixel",
        clientId,
      });
      if (d.error) setSetupError(d.error);
      else await load();
    } catch (e) {
      setSetupError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setSettingUp(false);
    }
  }, [clientId, load, t]);

  // A connected account without a pixel gets one automatically (once per visit; the button retries).
  useEffect(() => {
    if (canManage && accounts && accounts.length > 0 && !pixelId && !triedSetup.current) {
      triedSetup.current = true;
      setupTracking();
    }
  }, [accounts, pixelId, canManage, setupTracking]);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const state = beginOAuth(TIKTOK_KEY, clientId);
      const d = await invokeFn<{ authUrl?: string }>("tiktok-oauth", {
        action: "get-auth-url",
        redirectUri: `${window.location.origin}/tiktok/callback`,
        state,
        clientId,
      });
      if (!d.authUrl) throw new Error(t("connections.authUrlMissing"));
      window.location.href = d.authUrl;
    } catch (e) {
      toast.error(isLimitError(e) ? t("limits.tiktok") : e instanceof Error ? e.message : t("common.error"));
      setConnecting(false);
    }
  }, [clientId, t]);

  useEffect(() => {
    if (autoStart && canManage) connect();
    // run once per explicit ?connect=tiktok
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const savePixel = async () => {
    const code = pixelCode.trim();
    if (!code) return toast.error(t("connections.tiktok.pixelRequired"));
    setSavingPixel(true);
    const { data, error } = pixelId
      ? await supabase.from("tiktok_pixels").update({ pixel_code: code }).eq("id", pixelId).select("id").single()
      : await supabase.from("tiktok_pixels").insert({ client_id: clientId, pixel_code: code }).select("id").single();
    setSavingPixel(false);
    if (error) return toast.error(t("connections.tiktok.pixelFailed"));
    setPixelId(data.id);
    toast.success(t("connections.tiktok.pixelSaved"));
  };

  const testEvent = async () => {
    const code = window.prompt(t("connections.tiktok.testPrompt"));
    if (code === null) return;
    try {
      const d = await invokeFn<{ accepted?: boolean; message?: string }>("tiktok-oauth", {
        action: "test-event",
        clientId,
        testEventCode: code,
      });
      if (d.accepted) toast.success(t("connections.tiktok.testAccepted"));
      else toast.error(t("connections.tiktok.testRejected", { message: d.message ?? "" }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  };

  const [removing, setRemoving] = useState<Account | null>(null);

  // Removes the login only; campaign history and the saved pixel stay, so connecting again picks up where it left off.
  const disconnect = async (account: Account) => {
    const { error } = await supabase.from("tiktok_accounts").delete().eq("id", account.id);
    setRemoving(null);
    if (error) return toast.error(t("connections.tiktok.disconnectFailed"));
    toast.success(t("connections.tiktok.disconnected"));
    load();
  };

  const connected = accounts === null ? null : accounts.length > 0;
  // Individuals keep one ad account: once connected, the button re-authorizes it (new TikTok permissions,
  // expired login) instead of adding another.
  const atLimit = isIndividual && (accounts?.length ?? 0) >= 1;
  const canConnect = canManage;

  return (
    <ConnectionCard
      icon={<Zap className="h-6 w-6" />}
      accent="bg-gradient-to-br from-chart-1 to-chart-5"
      title={t("connections.tiktok.title")}
      description={t("connections.tiktok.description")}
      connected={connected}
      actions={
        <>
          {connected && (
            <Button variant="outline" size="sm" onClick={testEvent} disabled={!pixelId}>
              <Zap className="w-4 h-4" /> {t("connections.tiktok.testEvent")}
            </Button>
          )}
          {canConnect && (
            <Button variant={connected ? "outline" : "glow"} size="sm" onClick={connect} disabled={connecting}>
              {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
              {connected
                ? t(atLimit ? "connections.tiktok.reconnect" : "connections.tiktok.addAccount")
                : t("connections.connect")}
            </Button>
          )}
        </>
      }
    >
      {connected && <TikTokBalanceCard clientId={clientId} className="mb-4" />}
      {accounts && accounts.length > 0 && (
        <ul className="mb-4 space-y-1 text-sm">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2">
              <span className="text-foreground">{a.advertiser_name ?? t("connections.tiktok.unnamed")}</span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground" dir="ltr">
                  {a.advertiser_id}
                </span>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRemoving(a)}
                    aria-label={t("connections.tiktok.disconnect")}
                  >
                    <Unplug className="w-4 h-4" /> {t("connections.tiktok.disconnect")}
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {connected && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-secondary/50 px-3 py-2 text-sm">
          {settingUp ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-primary" /> {t("connections.tiktok.settingUp")}
            </>
          ) : pixelId ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-success" /> {t("connections.tiktok.trackingReady")}{" "}
              <span className="text-xs text-muted-foreground" dir="ltr">
                {pixelCode}
              </span>
            </>
          ) : (
            <>
              <span className="text-muted-foreground">{setupError ?? t("connections.tiktok.noTracking")}</span>
              {canManage && (
                <Button size="sm" variant="outline" onClick={setupTracking}>
                  {t("connections.tiktok.setupTracking")}
                </Button>
              )}
            </>
          )}
        </div>
      )}
      <details open={!pixelId && !settingUp && !!setupError} className="space-y-2">
        <summary className="cursor-pointer text-sm text-muted-foreground">{t("connections.tiktok.ownPixel")}</summary>
        <Label htmlFor="tiktok-pixel">{t("connections.tiktok.pixel")}</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="tiktok-pixel"
            dir="ltr"
            value={pixelCode}
            onChange={(e) => setPixelCode(e.target.value)}
            placeholder="C4ABC123DEF456"
            disabled={!canManage}
          />
          <Button onClick={savePixel} disabled={!canManage || savingPixel}>
            {savingPixel && <Loader2 className="w-4 h-4 animate-spin" />}
            {t("connections.tiktok.savePixel")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("connections.tiktok.pixelHint")}</p>
      </details>
      {isIndividual && (accounts?.length ?? 0) >= 1 && (
        <p className="mt-3 text-xs text-muted-foreground">{t("limits.tiktok")}</p>
      )}
      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("connections.tiktok.disconnectTitle", { name: removing?.advertiser_name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("connections.tiktok.disconnectBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => removing && disconnect(removing)}>
              {t("connections.tiktok.disconnect")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConnectionCard>
  );
}
