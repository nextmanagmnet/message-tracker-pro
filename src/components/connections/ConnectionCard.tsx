import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export function ConnectionCard({
  icon,
  title,
  description,
  connected,
  actions,
  children,
  accent,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  connected: boolean | null;
  actions?: ReactNode;
  children?: ReactNode;
  accent: string;
}) {
  const { t } = useTranslation("features");
  return (
    <section className="glass-card p-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white", accent)}>{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-foreground">{title}</h2>
            {connected === null ? (
              <span className="badge-pending">{t("connections.checking")}</span>
            ) : connected ? (
              <span className="badge-verified">{t("connections.connected")}</span>
            ) : (
              <span className="badge-pending">{t("connections.notConnected")}</span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </section>
  );
}
