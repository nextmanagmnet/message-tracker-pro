import { useTranslation } from "react-i18next";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccountsTab } from "@/components/ad-accounts/AccountsTab";
import { PerformanceTab } from "@/components/ad-accounts/PerformanceTab";
import { useAgency } from "@/hooks/useAgency";

const AdAccounts = () => {
  const { t } = useTranslation("agencylinks");
  const { agency, can } = useAgency();
  return (
    <DashboardLayout title={t("title")} subtitle={t("subtitle")}>
      {agency && (
        <Tabs defaultValue="accounts" className="space-y-4">
          <TabsList>
            <TabsTrigger value="accounts">{t("tabs.accounts")}</TabsTrigger>
            <TabsTrigger value="performance">{t("tabs.performance")}</TabsTrigger>
          </TabsList>
          <TabsContent value="accounts">
            <AccountsTab agencyId={agency.id} agencyName={agency.name} canManage={can("ad_accounts")} />
          </TabsContent>
          <TabsContent value="performance">
            <PerformanceTab agencyId={agency.id} />
          </TabsContent>
        </Tabs>
      )}
    </DashboardLayout>
  );
};

export default AdAccounts;
