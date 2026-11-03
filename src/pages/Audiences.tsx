import { useTranslation } from "react-i18next";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

// Placeholder: the audiences feature is being built.
const Audiences = () => {
  const { t } = useTranslation("audiences");
  return (
    <DashboardLayout title={t("title")} subtitle={t("subtitle")}>
      {null}
    </DashboardLayout>
  );
};

export default Audiences;
