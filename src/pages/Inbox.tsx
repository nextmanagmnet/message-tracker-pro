import { useTranslation } from "react-i18next";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

// Placeholder: the inbox feature is being built.
const Inbox = () => {
  const { t } = useTranslation("inbox");
  return (
    <DashboardLayout title={t("title")} subtitle={t("subtitle")}>
      {null}
    </DashboardLayout>
  );
};

export default Inbox;
