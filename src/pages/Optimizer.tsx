import { useTranslation } from "react-i18next";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

// Placeholder: the optimizer feature is being built.
const Optimizer = () => {
  const { t } = useTranslation("optimizer");
  return (
    <DashboardLayout title={t("title")} subtitle={t("subtitle")}>
      {null}
    </DashboardLayout>
  );
};

export default Optimizer;
