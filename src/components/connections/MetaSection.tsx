import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Database, ExternalLink, Loader2, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { db, invokeFn, isLimitError } from "@/components/leads/shared";
import { ConnectionCard } from "./ConnectionCard";
import { beginOAuth, META_KEY } from "./oauth";

type MetaAccount = {
  id: string;
  ad_account_id: string;
  ad_account_name: string | null;
  dataset_id: string | null;
  dataset_name: string | null;
};
type Option = { id: string; name: string };

export function MetaSection({
  clientId,
  canManage,
  autoStart,
  openDatasetPicker,
}: {
  clientId: string;
  canManage: boolean;
  autoStart: boolean;
  openDatasetPicker: boolean;
}) {
  const { t } = useTranslation("features");
  const [account, setAccount] = useState<MetaAccount | null | undefined>(undefined);
  const [connecting, setConnecting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [datasets, setDatasets] = useState<Option[] | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await db.from("meta_accounts")
      .select("id, ad_account_id, ad_account_name, dataset_id, dataset_name")
      .eq("client_id", clientId).limit(1).maybeSingle();
    if (error) console.error("meta_accounts load failed", error);
    setAccount((data as MetaAccount) ?? null);
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const state = beginOAuth(META_KEY, clientId);
      const d = await invokeFn<{ authUrl?: string }>("meta-oauth", {
        action: "get-auth-url",
        redirectUri: `${window.location.origin}/meta/callback`,
        state,
        clientId,
      });
      if (!d.authUrl) throw new Error(t("connections.authUrlMissing"));
      window.location.href = d.authUrl;
    } catch (e) {
      toast.error(isLimitError(e) ? t("limits.meta") : e instanceof Error ? e.message : t("common.error"));
      setConnecting(false);
    }
  }, [clientId, t]);

  const openPicker = useCallback(async () => {
    setPickerOpen(true);
    setDatasets(null);
    try {
      const d = await invokeFn<{ datasets?: Option[] }>("meta-oauth", { action: "list-datasets", clientId });
      setDatasets(d.datasets ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
      setPickerOpen(false);
    }
  }, [clientId, t]);

  useEffect(() => {
    if (autoStart && canManage) connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  useEffect(() => {
    if (openDatasetPicker && account) openPicker();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDatasetPicker, account?.id]);

  const selectDataset = async (ds: Option) => {
    try {
      await invokeFn("meta-oauth", { action: "select-dataset", clientId, datasetId: ds.id, datasetName: ds.name });
      toast.success(t("connections.meta.datasetSaved"));
      setPickerOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  };

  const disconnect = async () => {
    if (!window.confirm(t("connections.meta.confirmDisconnect"))) return;
    try {
      await invokeFn("meta-oauth", { action: "disconnect", clientId });
      toast.success(t("connections.meta.disconnected"));
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  };

  return (
    <ConnectionCard
      icon={<span className="text-lg font-bold">f</span>}
      accent="bg-gradient-to-br from-chart-4 to-chart-6"
      title={t("connections.meta.title")}
      description={t("connections.meta.description")}
      connected={account === undefined ? null : !!account}
      actions={
        canManage &&
        (account ? (
          <>
            <Button variant="outline" size="sm" onClick={openPicker}>
              <Database className="w-4 h-4" /> {t("connections.meta.chooseDataset")}
            </Button>
            <Button variant="ghost" size="sm" onClick={disconnect}>
              <Unplug className="w-4 h-4" /> {t("whatsapp.disconnect")}
            </Button>
          </>
        ) : (
          <Button variant="glow" size="sm" onClick={connect} disabled={connecting}>
            {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
            {t("connections.connect")}
          </Button>
        ))
      }
    >
      {account && (
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-lg bg-secondary/50 px-3 py-2">
            <dt className="text-xs text-muted-foreground">{t("connections.meta.adAccount")}</dt>
            <dd className="text-foreground">{account.ad_account_name ?? account.ad_account_id}</dd>
          </div>
          <div className="rounded-lg bg-secondary/50 px-3 py-2">
            <dt className="text-xs text-muted-foreground">{t("connections.meta.dataset")}</dt>
            <dd className={account.dataset_id ? "text-foreground" : "text-warning"}>
              {account.dataset_name ?? account.dataset_id ?? t("connections.meta.noDataset")}
            </dd>
          </div>
        </dl>
      )}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("connections.meta.chooseDataset")}</DialogTitle>
            <DialogDescription>{t("connections.meta.datasetHint")}</DialogDescription>
          </DialogHeader>
          {datasets === null ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : datasets.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">{t("connections.meta.noDatasets")}</p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {datasets.map((ds) => (
                <li key={ds.id}>
                  <button
                    type="button"
                    onClick={() => selectDataset(ds)}
                    className="w-full rounded-lg border border-border p-3 text-start hover:border-primary/50 hover:bg-secondary/50"
                  >
                    <p className="font-medium text-foreground">{ds.name}</p>
                    <p className="text-xs text-muted-foreground" dir="ltr">{ds.id}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </ConnectionCard>
  );
}
