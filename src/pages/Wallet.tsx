import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAgency } from "@/hooks/useAgency";
import { useFormat } from "@/components/leads/shared";
import { CopyCode } from "@/components/wallet/CopyCode";
import { WalletHistory } from "@/components/wallet/WalletHistory";
import { useWallet } from "@/components/wallet/useWallet";

const Wallet = () => {
  const { t } = useTranslation("wallet");
  const f = useFormat();
  const { selectedClient } = useAgency();
  const { info, failed } = useWallet(selectedClient?.id);
  const s = info?.settings ?? null;

  return (
    <DashboardLayout title={t("title")} subtitle={t("subtitle")}>
      {!selectedClient ? (
        <div className="glass-card p-12 text-center text-muted-foreground">{t("noClient")}</div>
      ) : failed ? (
        <div className="glass-card p-12 text-center text-muted-foreground">{t("loadFailed")}</div>
      ) : !info ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <section className="glass-card space-y-3 p-6" aria-label={t("balance")}>
              <p className="text-sm text-muted-foreground">{t("balance")}</p>
              <p className="font-display text-5xl font-bold text-foreground" dir="auto">
                {f.money(info.balance, info.currency)}
              </p>
              <div className="space-y-1 pt-2">
                <p className="text-xs text-muted-foreground">{t("reference")}</p>
                <CopyCode code={info.referenceCode} />
              </div>
            </section>

            <section className="glass-card space-y-3 p-6">
              <h2 className="font-semibold text-foreground">{t("addFunds")}</h2>
              {s?.paymentInstructions ? (
                <p className="whitespace-pre-wrap text-sm text-foreground" dir="auto">
                  {s.paymentInstructions}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">{t("askAgency")}</p>
              )}
              <p className="text-sm text-foreground">
                {t("quoteCode")}{" "}
                <span className="font-mono font-semibold" dir="ltr">
                  {info.referenceCode}
                </span>
              </p>
              {s && (
                <p className="text-xs text-muted-foreground">
                  {t("minimum", { amount: f.money(s.minTopup, info.currency) })}
                </p>
              )}
              <p className="text-xs text-muted-foreground">{t("creditNote")}</p>
            </section>
          </div>
          <WalletHistory clientId={selectedClient.id} currency={info.currency} reloadKey={info.balance} />
        </div>
      )}
    </DashboardLayout>
  );
};

export default Wallet;
