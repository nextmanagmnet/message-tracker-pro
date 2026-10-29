import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAgency } from "@/hooks/useAgency";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Building2, Users, Shield, Bell, Plug, Activity, Loader2, ExternalLink, Trash2, Palette } from "lucide-react";
import { setLanguage, type Language } from "@/i18n";
import { setTheme, useTheme } from "@/components/brand/theme";
import { cn } from "@/lib/utils";

type Member = {
  member_id: string;
  user_id: string;
  role: "owner" | "admin" | "viewer";
  email: string | null;
  full_name: string | null;
};

type Job = {
  id: string;
  job_name: string;
  status: string;
  error_message: string | null;
  started_at: string;
};

type Prefs = {
  new_verified: boolean;
  daily_summary: boolean;
  campaign_alerts: boolean;
  number_status: boolean;
};

const DEFAULT_PREFS: Prefs = {
  new_verified: true,
  daily_summary: true,
  campaign_alerts: false,
  number_status: true,
};

const PREF_LABELS: { key: keyof Prefs; label: string }[] = [
  { key: "new_verified", label: "settings.prefNewVerified" },
  { key: "daily_summary", label: "settings.prefDailySummary" },
  { key: "campaign_alerts", label: "settings.prefCampaignAlerts" },
  { key: "number_status", label: "settings.prefNumberStatus" },
];

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
            value === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
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
  const { user } = useAuth();
  const { agency, canManage, isOwner, isIndividual } = useAgency();

  const [companyName, setCompanyName] = useState("");
  const [savingCompany, setSavingCompany] = useState(false);

  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

  const [jobs, setJobs] = useState<Job[]>([]);

  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  useEffect(() => {
    if (agency) setCompanyName(agency.name);
  }, [agency]);

  // Team members
  const loadMembers = async () => {
    if (!agency || isIndividual) return;
    setLoadingMembers(true);
    const { data, error } = await supabase.rpc("get_agency_members", { _agency_id: agency.id });
    if (error) toast.error(t("settings.teamLoadFailed"));
    setMembers((data as Member[]) ?? []);
    setLoadingMembers(false);
  };
  useEffect(() => {
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agency?.id, isIndividual]);

  // Background jobs
  useEffect(() => {
    if (!agency) return;
    supabase
      .from("integration_jobs")
      .select("id, job_name, status, error_message, started_at")
      .order("started_at", { ascending: false })
      .limit(8)
      .then(({ data }) => setJobs((data as Job[]) ?? []));
  }, [agency?.id]);

  // Notification preferences
  useEffect(() => {
    if (!user) return;
    supabase
      .from("notification_preferences")
      .select("new_verified, daily_summary, campaign_alerts, number_status")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => data && setPrefs(data as Prefs));
  }, [user?.id]);

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

  const changeRole = async (memberId: string, role: Member["role"]) => {
    const { error } = await supabase.from("agency_members").update({ role }).eq("id", memberId);
    if (error) return toast.error(t("settings.roleFailed"));
    toast.success(t("settings.roleUpdated"));
    loadMembers();
  };

  const removeMember = async (memberId: string) => {
    const { error } = await supabase.from("agency_members").delete().eq("id", memberId);
    if (error) return toast.error(t("settings.memberRemoveFailed"));
    toast.success(t("settings.memberRemoved"));
    loadMembers();
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

  const togglePref = async (key: keyof Prefs, value: boolean) => {
    if (!user) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    const { error } = await supabase
      .from("notification_preferences")
      .upsert({ user_id: user.id, ...next, updated_at: new Date().toISOString() });
    if (error) {
      setPrefs(prefs);
      toast.error(t("settings.prefFailed"));
    }
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
          <SectionHeader icon={Palette} title={t("settings.preferencesTitle")} subtitle={t("settings.preferencesSubtitle")} />
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
        <div className="glass-card p-6">
          <SectionHeader icon={Users} title={t("settings.teamTitle")} subtitle={t("settings.teamSubtitle")} />
          {isIndividual ? (
            <p className="text-sm text-muted-foreground">{t("settings.teamIndividual")}</p>
          ) : loadingMembers ? (
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          ) : (
            <div className="space-y-3">
              {members.map((m) => {
                const isSelf = m.user_id === user?.id;
                const label = m.full_name || m.email || t("common.unknownUser");
                return (
                  <div key={m.member_id} className="flex items-center justify-between gap-3 p-4 rounded-lg bg-secondary/50">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-brand-pink to-brand-orange flex items-center justify-center text-sm font-semibold text-white">
                        {label.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">
                          {label} {isSelf && <span className="text-xs text-muted-foreground">{t("common.you")}</span>}
                        </p>
                        <p className="text-sm text-muted-foreground truncate" dir="ltr">
                          {m.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isOwner && !isSelf ? (
                        <>
                          <select
                            value={m.role}
                            onChange={(e) => changeRole(m.member_id, e.target.value as Member["role"])}
                            className="px-3 py-1.5 text-sm bg-secondary border border-border rounded-lg text-foreground"
                          >
                            <option value="owner">{t("roles.owner")}</option>
                            <option value="admin">{t("roles.admin")}</option>
                            <option value="viewer">{t("roles.viewer")}</option>
                          </select>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeMember(m.member_id)}
                            aria-label={t("settings.removeMember")}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <span className="px-3 py-1 text-xs font-medium rounded-full bg-secondary text-muted-foreground">
                          {t(`roles.${m.role}`)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* WhatsApp numbers, ad accounts and pixels live on the Connections page */}
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
                    <p className="text-foreground">
                      {j.job_name === "sync-campaigns" ? t("settings.jobCampaignSync") : t("settings.jobLoginRefresh")}
                    </p>
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

        {/* Notifications */}
        <div className="glass-card p-6">
          <SectionHeader
            icon={Bell}
            title={t("settings.notificationsTitle")}
            subtitle={t("settings.notificationsSubtitle")}
          />
          <div className="space-y-3">
            {PREF_LABELS.map(({ key, label }) => (
              <label key={key} className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 cursor-pointer">
                <span className="text-foreground">{t(label)}</span>
                <Switch checked={prefs[key]} onCheckedChange={(v) => togglePref(key, v)} />
              </label>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Settings;
