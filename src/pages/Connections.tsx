import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAgency } from "@/hooks/useAgency";
import { WhatsAppSection } from "@/components/connections/WhatsAppSection";
import { TikTokSection } from "@/components/connections/TikTokSection";
import { MetaSection } from "@/components/connections/MetaSection";

const Connections = () => {
  const { t } = useTranslation("features");
  const agency = useAgency();
  const { selectedClient, canManageClient: canManage } = agency;
  // accountType/isIndividual are added to useAgency by the shell agent.
  const isIndividual = (agency as { isIndividual?: boolean }).isIndividual ?? false;
  const [params, setParams] = useSearchParams();
  // Capture the one-shot intents before stripping them from the URL.
  const [intent] = useState(() => ({ connect: params.get("connect") }));

  useEffect(() => {
    if (params.has("connect")) setParams({}, { replace: true });
  }, [params, setParams]);

  return (
    <DashboardLayout title={t("connections.title")} subtitle={t("connections.subtitle")}>
      {!selectedClient ? (
        <div className="glass-card wob-mesh-card p-12 text-center text-muted-foreground">{t("common.selectClient")}</div>
      ) : (
        <div className="space-y-6" key={selectedClient.id}>
          <WhatsAppSection clientId={selectedClient.id} isIndividual={isIndividual} canManage={canManage} />
          <TikTokSection
            clientId={selectedClient.id}
            isIndividual={isIndividual}
            canManage={canManage}
            autoStart={intent.connect === "tiktok"}
          />
          <MetaSection clientId={selectedClient.id} canManage={canManage} />
        </div>
      )}
    </DashboardLayout>
  );
};

export default Connections;
