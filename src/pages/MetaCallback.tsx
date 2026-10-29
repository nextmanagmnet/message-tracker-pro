import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { invokeFn, isLimitError } from "@/components/leads/shared";
import { META_KEY, readPending } from "@/components/connections/oauth";

type AdAccount = { id: string; name: string };

const MetaCallback = () => {
  const { t } = useTranslation("features");
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<AdAccount[] | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const started = useRef(false);
  const clientId = useRef<string | null>(null);

  const fail = (msg: string) => {
    toast.error(msg);
    navigate("/connections", { replace: true });
  };

  const select = async (acc: AdAccount) => {
    setSaving(acc.id);
    try {
      await invokeFn("meta-oauth", { action: "select-account", clientId: clientId.current, adAccountId: acc.id, adAccountName: acc.name });
      toast.success(t("callback.metaConnected"));
      navigate("/connections?pick=meta-dataset", { replace: true });
    } catch (e) {
      fail(isLimitError(e) ? t("limits.meta") : e instanceof Error ? e.message : t("common.error"));
    }
  };

  useEffect(() => {
    if (started.current) return; // StrictMode double-invoke would reuse the one-time code
    started.current = true;
    (async () => {
      const code = params.get("code");
      const state = params.get("state");
      if (params.get("error")) return fail(params.get("error_description") || t("callback.cancelled"));
      const pending = readPending(META_KEY);
      if (!code || !state || !pending) return fail(t("callback.noPending"));
      if (pending.state !== state) return fail(t("callback.stateMismatch"));
      clientId.current = pending.clientId;
      try {
        const d = await invokeFn<{ adAccounts?: AdAccount[] }>("meta-oauth", {
          action: "callback",
          code,
          redirectUri: `${window.location.origin}/meta/callback`,
          clientId: pending.clientId,
        });
        sessionStorage.removeItem(META_KEY);
        const list = d.adAccounts ?? [];
        if (list.length === 0) return fail(t("callback.noAdAccounts"));
        if (list.length === 1) return select(list[0]);
        setAccounts(list);
      } catch (e) {
        fail(isLimitError(e) ? t("limits.meta") : e instanceof Error ? e.message : t("callback.failed"));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background wob-mesh-hero p-4">
      <div className="glass-card p-8 max-w-md w-full">
        {accounts === null ? (
          <>
            <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
              <Loader2 className="w-5 h-5 animate-spin text-primary" /> {t("callback.metaTitle")}
            </h1>
            <p className="text-sm text-muted-foreground mt-2">{t("callback.working")}</p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-foreground">{t("callback.pickAdAccount")}</h1>
            <ul className="mt-4 space-y-2">
              {accounts.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    disabled={!!saving}
                    onClick={() => select(a)}
                    className="w-full rounded-lg border border-border p-3 text-start hover:border-primary/50 hover:bg-secondary/50 disabled:opacity-60"
                  >
                    <p className="font-medium text-foreground">{a.name}</p>
                    <p className="text-xs text-muted-foreground" dir="ltr">{a.id}</p>
                    {saving === a.id && <Loader2 className="mt-1 w-4 h-4 animate-spin text-primary" />}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
};

export default MetaCallback;
