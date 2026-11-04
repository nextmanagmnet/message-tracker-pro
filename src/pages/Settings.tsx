import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAgency } from "@/hooks/useAgency";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Building2, Users, Shield, Plug, Activity, Loader2, ExternalLink, Palette, Wallet } from "lucide-react";
import { setLanguage, type Language } from "@/i18n";
import { setTheme, useTheme } from "@/components/brand/theme";
import { cn } from "@/lib/utils";
import { WeeklyReportSection } from "@/components/settings/WeeklyReportSection";
import { TeamSection } from "@/components/settings/TeamSection";
import { WalletSettingsCard } from "@/components/funding/WalletsPanel";

type Job = {
  id: string;
  job_name: string;
  status: string;
  error_message: string | null;
  started_at: string;
};

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border p-1 bg-secondary/50">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "px-4 py-1.5 text-sm rounded-md transition-colors",
            value === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const SectionHeader = ({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) => (
  <div className="flex items-start justify-between gap-4 mb-6">
    <div className="flex items-start gap-4">
      <div className="p-3 rounded-xl bg-primary/10">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
    {action}
  </div>
);

const Settings = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { agency, canManage, can, isIndividual, isClientUser } = useAgency();

  const [companyName, setCompanyName] = useState("");
  const [savingCompany, setSavingCompany] = useState(false);

  const [jobs, setJobs] = useState<Job[]>([]);

  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (agency) setCompanyName(agency.name);
  }, [agency]);

  // Background jobs
  const agencyId = agency?.id;
  useEffect(() => {
    if (!agencyId) return;
    supabase
      .from("integration_jobs")
      .select("id, job_name, status, error_message, started_at")
      .order("started_at", { ascending: false })
      .limit(8)
      .then(({ data }) => setJobs((data as Job[]) ?? []));
  }, [agencyId]);

  const saveCompany = async () => {
    if (!agency || !companyName.trim()) return;
    setSavingCompany(true);
    const { error } = await supabase.from("agencies").update({ name: companyName.trim() }).eq("id", agency.id);
    setSavingCompany(false);
    if (error) {
      toast.error(t("settings.companyFailed"));
    } else {
      toast.success(t("settings.companySaved"));
    }
  };

  const changePassword = async () => {
    if (newPassword.length < 8) return toast.error(t("settings.passwordShort"));
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) return toast.error(error.message);
    setNewPassword("");
    toast.success(t("settings.passwordUpdated"));
  };

  const jobStatusClass = (s: string) =>
    s === "success" ? "badge-verified" : s === "failed" ? "badge-trash" : "badge-pending";

  return (
    <DashboardLayout title={t("settings.title")} subtitle={t("settings.subtitle")}>
      <div className="max-w-4xl space-y-6">
        {/* Company */}
        <div className="glass-card p-6">
          <SectionHeader
            icon={Building2}
            title={isIndividual ? t("settings.companyTitle") : t("settings.companyTitleAgency")}
            subtitle={t("settings.companySubtitle")}
            action={
              <span className="px-3 py-1 text-xs font-medium rounded-full bg-primary/10 text-primary">
                {isIndividual ? t("auth.individual") : t("auth.agency")}
              </span>
            }
          />
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              disabled={!canManage}
              placeholder={t("settings.companyPlaceholder")}
            />
            <Button onClick={saveCompany} disabled={!canManage || savingCompany || companyName === agency?.name}>
              {savingCompany && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("common.save")}
            </Button>
          </div>
        </div>

        {/* Preferences */}
        <div className="glass-card p-6">
          <SectionHeader
            icon={Palette}
            title={t("settings.preferencesTitle")}
            subtitle={t("settings.preferencesSubtitle")}
          />
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-foreground">{t("language.label")}</span>
              <Segmented<Language>
                value={i18n.language === "ar" ? "ar" : "en"}
                onChange={setLanguage}
                options={[
                  { value: "en", label: t("language.en") },
                  { value: "ar", label: t("language.ar") },
                ]}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-foreground">{t("theme.label")}</span>
              <Segmented
                value={theme}
                onChange={setTheme}
                options={[
                  { value: "dark", label: t("theme.dark") },
                  { value: "light", label: t("theme.light") },
                ]}
              />
            </div>
          </div>
        </div>

        {/* Team (agency accounts only) */}
        {isClientUser || isIndividual ? (
          <div className="glass-card p-6">
            <SectionHeader icon={Users} title={t("settings.teamTitle")} subtitle={t("settings.teamSubtitle")} />
            <p className="text-sm text-muted-foreground">
              {isClientUser ? t("settings.teamClient") : t("settings.teamIndividual")}
            </p>
          </div>
        ) : (
          <TeamSection />
        )}

        {/* What users are charged and how they pay (agency, funding permission) */}
        {!isIndividual && !isClientUser && agency && can("funding") && (
          <div className="glass-card p-6">
            <SectionHeader
              icon={Wallet}
              title={t("settings.fundingCard.title")}
              subtitle={t("settings.fundingCard.subtitle")}
            />
            <WalletSettingsCard agencyId={agency.id} />
          </div>
        )}

        {/* WhatsApp numbers, ad accounts and pixels live on the Connections page */}
        {(isIndividual || isClientUser) && (
          <div className="glass-card p-6">
            <SectionHeader
              icon={Plug}
              title={t("settings.connectionsTitle")}
              subtitle={t("settings.connectionsSubtitle")}
              action={
                <Button variant="outline" size="sm" onClick={() => navigate("/connections")}>
                  <ExternalLink className="w-4 h-4" />
                  {t("settings.openConnections")}
                </Button>
              }
            />
          </div>
        )}

        {/* Automation */}
        <div className="glass-card p-6">
          <SectionHeader icon={Activity} title={t("settings.syncTitle")} subtitle={t("settings.syncSubtitle")} />
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("settings.syncEmpty")}</p>
          ) : (
            <div className="space-y-2">
              {jobs.map((j) => (
                <div key={j.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 text-sm">
                  <div className="min-w-0">
                    <p className="text-foreground">{t(`settings.jobs.${j.job_name}`, { defaultValue: j.job_name })}</p>
                    {j.error_message && <p className="text-xs text-destructive truncate">{j.error_message}</p>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {new Date(j.started_at).toLocaleString(i18n.language)}
                    </span>
                    <span className={jobStatusClass(j.status)}>{j.status.replace(/_/g, " ")}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Security */}
        <div className="glass-card p-6">
          <SectionHeader icon={Shield} title={t("settings.securityTitle")} subtitle={t("settings.securitySubtitle")} />
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t("settings.newPassword")}
              autoComplete="new-password"
            />
            <Button onClick={changePassword} disabled={savingPassword || !newPassword}>
              {savingPassword && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("settings.updatePassword")}
            </Button>
          </div>
        </div>

        <WeeklyReportSection />
      </div>
    </DashboardLayout>
  );
};

export default Settings;
