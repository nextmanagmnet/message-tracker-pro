import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { invokeFn, isLimitError } from "@/components/leads/shared";
import { BC_KEY, readPending, TIKTOK_KEY } from "@/components/connections/oauth";

const TikTokCallback = () => {
  const { t } = useTranslation("features");
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // the auth code is single-use; guard StrictMode double-run
    started.current = true;
    const done = (ok: boolean, msg: string) => {
      (ok ? toast.success : toast.error)(msg);
      navigate("/connections", { replace: true });
    };
    (async () => {
      const code = params.get("code") ?? params.get("auth_code");
      const state = params.get("state");
      if (params.get("error")) return done(false, params.get("error_description") || t("callback.cancelled"));
      const bc = readPending(BC_KEY);
      if (code && state && bc && bc.state === state) {
        try {
          await invokeFn("tiktok-bc", { action: "callback", code, agencyId: bc.clientId });
          sessionStorage.removeItem(BC_KEY);
          toast.success(t("funding.connected"));
        } catch (e) {
          toast.error(e instanceof Error ? e.message : t("callback.failed"));
        }
        navigate("/funding", { replace: true });
        return;
      }
      const pending = readPending(TIKTOK_KEY);
      if (!code || !state || !pending) return done(false, t("callback.noPending"));
      if (pending.state !== state) return done(false, t("callback.stateMismatch"));
      try {
        const d = await invokeFn<{ advertiserCount?: number }>("tiktok-oauth", { action: "callback", code, clientId: pending.clientId });
        sessionStorage.removeItem(TIKTOK_KEY);
        if (!d.advertiserCount) return done(false, t("callback.noAdAccounts"));
        done(true, t("callback.tiktokConnected", { count: d.advertiserCount }));
      } catch (e) {
        done(false, isLimitError(e) ? t("limits.tiktok") : e instanceof Error ? e.message : t("callback.failed"));
      }
    })();
  }, [params, navigate, t]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background wob-mesh-hero p-4">
      <div className="glass-card p-8 max-w-md w-full">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <Loader2 className="w-5 h-5 animate-spin text-primary" /> {t("callback.tiktokTitle")}
        </h1>
        <p className="text-sm text-muted-foreground mt-2">{t("callback.working")}</p>
      </div>
    </div>
  );
};

export default TikTokCallback;
