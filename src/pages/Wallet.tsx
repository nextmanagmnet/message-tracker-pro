import { useTranslation } from "react-i18next";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

// Placeholder: the wallet feature is being built.
const Wallet = () => {
  const { t } = useTranslation("wallet");
  return (
    <DashboardLayout title={t("title")} subtitle={t("subtitle")}>
      {null}
    </DashboardLayout>
  );
};

export default Wallet;
