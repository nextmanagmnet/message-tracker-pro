import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Users } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { LinkedUsersSection } from "@/components/clients/LinkedUsersSection";
import { Button } from "@/components/ui/button";
import { useAgency } from "@/hooks/useAgency";

/** Campaigns for an agency that works through linked users: pick whose ads to run (here or in the top dropdown). */
const AgencyCampaigns = () => {
  const { t } = useTranslation("agencylinks");
  const { linkedAccounts, linkedLoading, refreshLinked } = useAgency();

  // A freshly accepted invite shows up as soon as the page opens.
  useEffect(() => {
    void refreshLinked();
  }, [refreshLinked]);

  return (
    <DashboardLayout title={t("campaignsPage.title")} subtitle={t("campaignsPage.subtitle")}>
      {linkedAccounts.length > 0 ? (
        <LinkedUsersSection />
      ) : (
        !linkedLoading && (
          <div className="glass-card flex flex-col items-center gap-3 p-10 text-center">
            <Users className="h-8 w-8 text-muted-foreground" aria-hidden />
            <h2 className="text-lg font-semibold">{t("perf.emptyTitle")}</h2>
            <p className="max-w-md text-sm text-muted-foreground">{t("campaignsPage.empty")}</p>
            <Button asChild>
              <Link to="/ad-accounts">{t("campaignsPage.invite")}</Link>
            </Button>
          </div>
        )
      )}
    </DashboardLayout>
  );
};

export default AgencyCampaigns;
