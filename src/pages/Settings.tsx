import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAgency } from "@/hooks/useAgency";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Building2,
  Users,
  Shield,
  Bell,
  Webhook,
  Copy,
  Check,
  Target,
  Activity,
  Loader2,
  ExternalLink,
  Trash2,
} from "lucide-react";

const WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;

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
  { key: "new_verified", label: "New verified conversation" },
  { key: "daily_summary", label: "Daily summary report" },
  { key: "campaign_alerts", label: "Campaign performance alerts" },
  { key: "number_status", label: "WhatsApp number status changes" },
];

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
  const { user } = useAuth();
  const { agency, selectedClient, canManage, isOwner } = useAgency();

  const [companyName, setCompanyName] = useState("");
  const [savingCompany, setSavingCompany] = useState(false);

  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

  const [tiktokCount, setTiktokCount] = useState(0);
  const [waCount, setWaCount] = useState(0);

  const [pixelCode, setPixelCode] = useState("");
  const [pixelId, setPixelId] = useState<string | null>(null);
  const [savingPixel, setSavingPixel] = useState(false);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [copied, setCopied] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  useEffect(() => {
    if (agency) setCompanyName(agency.name);
  }, [agency]);

  // Team members
  const loadMembers = async () => {
    if (!agency) return;
    setLoadingMembers(true);
    const { data, error } = await supabase.rpc("get_agency_members", { _agency_id: agency.id });
    if (error) toast.error("Couldn't load team members");
    setMembers((data as Member[]) ?? []);
    setLoadingMembers(false);
  };
  useEffect(() => {
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agency?.id]);

  // Integration status + pixel for selected client
  useEffect(() => {
    if (!selectedClient) return;
    (async () => {
      const [tt, wa, px] = await Promise.all([
        supabase.from("tiktok_accounts").select("id", { count: "exact", head: true }).eq("client_id", selectedClient.id),
        supabase
          .from("whatsapp_numbers")
          .select("id", { count: "exact", head: true })
          .eq("client_id", selectedClient.id)
          .eq("status", "connected"),
        supabase.from("tiktok_pixels").select("id, pixel_code").eq("client_id", selectedClient.id).maybeSingle(),
      ]);
      setTiktokCount(tt.count ?? 0);
      setWaCount(wa.count ?? 0);
      setPixelId(px.data?.id ?? null);
      setPixelCode(px.data?.pixel_code ?? "");
    })();
  }, [selectedClient?.id]);

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
    error ? toast.error("Couldn't save company name") : toast.success("Company name saved");
  };

  const changeRole = async (memberId: string, role: Member["role"]) => {
    const { error } = await supabase.from("agency_members").update({ role }).eq("id", memberId);
    if (error) return toast.error("Couldn't change role");
    toast.success("Role updated");
    loadMembers();
  };

  const removeMember = async (memberId: string) => {
    const { error } = await supabase.from("agency_members").delete().eq("id", memberId);
    if (error) return toast.error("Couldn't remove member");
    toast.success("Member removed");
    loadMembers();
  };

  const savePixel = async () => {
    if (!selectedClient) return;
    const code = pixelCode.trim();
    if (!code) return toast.error("Enter a pixel ID");
    setSavingPixel(true);
    const { data, error } = pixelId
      ? await supabase.from("tiktok_pixels").update({ pixel_code: code }).eq("id", pixelId).select("id").single()
      : await supabase.from("tiktok_pixels").insert({ client_id: selectedClient.id, pixel_code: code }).select("id").single();
    setSavingPixel(false);
    if (error) return toast.error("Couldn't save pixel");
    setPixelId(data.id);
    toast.success(`Pixel saved for ${selectedClient.name}`);
  };

  const copyWebhook = async () => {
    await navigator.clipboard.writeText(WEBHOOK_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const changePassword = async () => {
    if (newPassword.length < 8) return toast.error("Password must be at least 8 characters");
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) return toast.error(error.message);
    setNewPassword("");
    toast.success("Password updated");
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
      toast.error("Couldn't save preference");
    }
  };

  const jobStatusClass = (s: string) =>
    s === "success" ? "badge-verified" : s === "failed" ? "badge-trash" : "badge-pending";

  return (
    <DashboardLayout title="Settings" subtitle="Manage your agency, clients and integrations">
      <div className="max-w-4xl space-y-6">
        {/* Company */}
        <div className="glass-card p-6">
          <SectionHeader icon={Building2} title="Agency Settings" subtitle="Your agency's name shown across the app" />
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              disabled={!canManage}
              placeholder="Agency name"
            />
            <Button onClick={saveCompany} disabled={!canManage || savingCompany || companyName === agency?.name}>
              {savingCompany && <Loader2 className="w-4 h-4 animate-spin" />}
              Save
            </Button>
          </div>
        </div>

        {/* Team */}
        <div className="glass-card p-6">
          <SectionHeader icon={Users} title="Team Members" subtitle="People with access to this agency" />
          {loadingMembers ? (
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          ) : (
            <div className="space-y-3">
              {members.map((m) => {
                const isSelf = m.user_id === user?.id;
                const label = m.full_name || m.email || "Unknown user";
                return (
                  <div key={m.member_id} className="flex items-center justify-between gap-3 p-4 rounded-lg bg-secondary/50">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-sm font-semibold text-primary-foreground">
                        {label.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">
                          {label} {isSelf && <span className="text-xs text-muted-foreground">(you)</span>}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">{m.email}</p>
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
                            <option value="owner">Owner</option>
                            <option value="admin">Admin</option>
                            <option value="viewer">Viewer</option>
                          </select>
                          <Button variant="ghost" size="icon" onClick={() => removeMember(m.member_id)} aria-label="Remove member">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <span className="px-3 py-1 text-xs font-medium rounded-full bg-secondary text-muted-foreground capitalize">
                          {m.role}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Client integrations */}
        <div className="glass-card p-6">
          <SectionHeader
            icon={Webhook}
            title="Integrations"
            subtitle={selectedClient ? `Status for ${selectedClient.name}` : "Select a client to see its integrations"}
          />
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-foreground">TikTok Ads</p>
                  {tiktokCount > 0 && <Check className="w-4 h-4 text-success" />}
                </div>
                <p className="text-sm text-muted-foreground">
                  {tiktokCount > 0 ? `${tiktokCount} advertiser account(s) connected` : "Not connected"}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate("/tiktok")}>
                <ExternalLink className="w-4 h-4" />
                {tiktokCount > 0 ? "Manage" : "Connect"}
              </Button>
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-foreground">WhatsApp Business</p>
                  {waCount > 0 && <Check className="w-4 h-4 text-success" />}
                </div>
                <p className="text-sm text-muted-foreground">
                  {waCount > 0 ? `${waCount} number(s) connected` : "No numbers connected"}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate("/whatsapp")}>
                <ExternalLink className="w-4 h-4" />
                {waCount > 0 ? "Manage" : "Connect"}
              </Button>
            </div>
            <div className="p-4 rounded-lg bg-secondary/50">
              <p className="font-medium text-foreground mb-1">WhatsApp webhook address</p>
              <p className="text-sm text-muted-foreground mb-3">
                Paste this into your Meta app's webhook settings and subscribe to "messages".
              </p>
              <div className="flex gap-2">
                <Input readOnly value={WEBHOOK_URL} className="font-mono text-xs" />
                <Button variant="outline" onClick={copyWebhook}>
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Pixel */}
        <div className="glass-card p-6">
          <SectionHeader
            icon={Target}
            title="TikTok Pixel"
            subtitle="Real conversations are reported to TikTok through this client's pixel"
          />
          {selectedClient ? (
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                value={pixelCode}
                onChange={(e) => setPixelCode(e.target.value)}
                placeholder="e.g. C4ABC123DEF456"
                disabled={!canManage}
              />
              <Button onClick={savePixel} disabled={!canManage || savingPixel}>
                {savingPixel && <Loader2 className="w-4 h-4 animate-spin" />}
                Save pixel
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Select a client first.</p>
          )}
        </div>

        {/* Automation */}
        <div className="glass-card p-6">
          <SectionHeader
            icon={Activity}
            title="Automatic Sync"
            subtitle="Campaign spend and TikTok logins refresh every hour automatically"
          />
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet. The first results appear after the next hourly run.</p>
          ) : (
            <div className="space-y-2">
              {jobs.map((j) => (
                <div key={j.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 text-sm">
                  <div className="min-w-0">
                    <p className="text-foreground">{j.job_name === "sync-campaigns" ? "Campaign sync" : "Login refresh"}</p>
                    {j.error_message && <p className="text-xs text-destructive truncate">{j.error_message}</p>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground">{new Date(j.started_at).toLocaleString()}</span>
                    <span className={jobStatusClass(j.status)}>{j.status.replace(/_/g, " ")}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Security */}
        <div className="glass-card p-6">
          <SectionHeader icon={Shield} title="Security" subtitle="Change your password" />
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (min 8 characters)"
              autoComplete="new-password"
            />
            <Button onClick={changePassword} disabled={savingPassword || !newPassword}>
              {savingPassword && <Loader2 className="w-4 h-4 animate-spin" />}
              Update password
            </Button>
          </div>
        </div>

        {/* Notifications */}
        <div className="glass-card p-6">
          <SectionHeader icon={Bell} title="Notifications" subtitle="Choose what you want to be notified about" />
          <div className="space-y-3">
            {PREF_LABELS.map(({ key, label }) => (
              <label key={key} className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 cursor-pointer">
                <span className="text-foreground">{label}</span>
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
