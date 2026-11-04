import { useTranslation } from "react-i18next";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

// Placeholder: the agency ad accounts page is being built.
const AdAccounts = () => {
  const { t } = useTranslation("agencylinks");
  return (
    <DashboardLayout title={t("title")} subtitle={t("subtitle")}>
      {null}
    </DashboardLayout>
  );
};

export default AdAccounts;
