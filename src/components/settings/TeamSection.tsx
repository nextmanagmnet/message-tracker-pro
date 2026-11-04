import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Copy, Loader2, Pencil, Trash2, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invokeFn } from "@/components/leads/shared";
import { PERMISSIONS, useAgency, type Permission } from "@/hooks/useAgency";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type Role = "admin" | "viewer";
type Member = {
  member_id: string;
  user_id: string;
  role: "owner" | "admin" | "viewer" | "client";
  email: string | null;
  full_name: string | null;
  permissions: string[] | null;
};
type Invite = { id: string; email: string; role: string; permissions: string[]; created_at: string };
type Access = { role: Role; permissions: Permission[] };

// Quick sets for the jobs people usually hand out. They only tick boxes; every box stays editable.
const PRESETS: { key: "full" | "media" | "finance"; permissions: Permission[] }[] = [
  { key: "full", permissions: [...PERMISSIONS] },
  { key: "media", permissions: ["ad_accounts"] },
  { key: "finance", permissions: ["funding"] },
];

function AccessPicker({ value, onChange }: { value: Access; onChange: (a: Access) => void }) {
  const { t } = useTranslation();
  const toggle = (p: Permission, on: boolean) =>
    onChange({ ...value, permissions: PERMISSIONS.filter((x) => (x === p ? on : value.permissions.includes(x))) });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="team-role">{t("settings.team.access")}</Label>
        <select
          id="team-role"
          value={value.role}
          onChange={(e) => onChange({ ...value, role: e.target.value as Role })}
          className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground"
        >
          <option value="admin">{t("settings.team.roleAdmin")}</option>
          <option value="viewer">{t("settings.team.roleViewer")}</option>
        </select>
      </div>

      {value.role === "admin" && (
        <fieldset className="space-y-3">
          <legend className="mb-1 text-sm font-medium">{t("settings.team.permsLabel")}</legend>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("settings.team.quickSet")}</span>
            {PRESETS.map((p) => (
              <Button
                key={p.key}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onChange({ ...value, permissions: p.permissions })}
              >
                {t(`settings.team.preset.${p.key}`)}
              </Button>
            ))}
          </div>
          {PERMISSIONS.map((p) => (
            <label key={p} className="flex cursor-pointer items-start gap-3 rounded-lg bg-secondary/50 p-3">
              <Checkbox
                checked={value.permissions.includes(p)}
                onCheckedChange={(on) => toggle(p, on === true)}
                className="mt-0.5"
              />
              <span className="text-sm">{t(`settings.team.perm.${p}`)}</span>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}

function AccessChips({ m }: { m: { role: Member["role"]; permissions: string[] | null } }) {
  const { t } = useTranslation();
  const chip = "rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground";
  if (m.role === "viewer") return <span className={chip}>{t("settings.team.viewerNote")}</span>;
  if (m.role !== "admin") return <span className={chip}>{t(`roles.${m.role}`)}</span>;
  if (m.permissions == null) return <span className={chip}>{t("settings.team.everything")}</span>;
  return (
    <>
      {m.permissions.map((p) => (
        <span key={p} className={chip}>
          {t(`settings.team.permShort.${p}`)}
        </span>
      ))}
    </>
  );
}

export function TeamSection() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { agency, isOwner } = useAgency();
  const agencyId = agency?.id;

  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [email, setEmail] = useState("");
  const [access, setAccess] = useState<Access>({ role: "admin", permissions: ["ad_accounts"] });
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);

  const load = useCallback(async () => {
    if (!agencyId) return;
    const [m, inv] = await Promise.all([
      supabase.rpc("get_agency_members", { _agency_id: agencyId }),
      isOwner
        ? supabase
            .from("team_invites")
            .select("id, email, role, permissions, created_at")
            .eq("agency_id", agencyId)
            .is("accepted_at", null)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as Invite[], error: null }),
    ]);
    if (m.error) toast.error(t("settings.teamLoadFailed"));
    setMembers((m.data as Member[]) ?? []);
    setInvites((inv.data as Invite[]) ?? []);
  }, [agencyId, isOwner, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const noPermission = access.role === "admin" && access.permissions.length === 0;

  const openAdd = () => {
    setEmail("");
    setAccess({ role: "admin", permissions: ["ad_accounts"] });
    setLink(null);
    setAdding(true);
  };

  const run = async (fn: () => Promise<void>, failed: string) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : failed);
    } finally {
      setBusy(false);
    }
  };

  const create = () =>
    run(async () => {
      const d = await invokeFn<{ link: string }>("team-invite", { action: "create", agencyId, email, ...access });
      setLink({ email: email.trim(), url: d.link });
      void load();
    }, t("settings.team.inviteFailed"));

  const save = () =>
    run(async () => {
      await invokeFn("team-invite", { action: "update", memberId: editing!.member_id, ...access });
      toast.success(t("settings.team.saved"));
      setEditing(null);
      void load();
    }, t("settings.team.saveFailed"));

  const revoke = (id: string) =>
    run(async () => {
      await invokeFn("team-invite", { action: "revoke", inviteId: id });
      toast.success(t("settings.team.revoked"));
      void load();
    }, t("settings.team.saveFailed"));

  const remove = async (memberId: string) => {
    const { error } = await supabase.from("agency_members").delete().eq("id", memberId);
    if (error) return toast.error(t("settings.memberRemoveFailed"));
    toast.success(t("settings.memberRemoved"));
    void load();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link!.url);
      toast.success(t("settings.team.copied"));
    } catch {
      toast.error(t("common.error"));
    }
  };

  const startEdit = (m: Member) => {
    setAccess({
      role: m.role === "viewer" ? "viewer" : "admin",
      permissions: PERMISSIONS.filter((p) => m.permissions == null || m.permissions.includes(p)),
    });
    setEditing(m);
  };

  return (
    <div className="glass-card p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-primary/10 p-3">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">{t("settings.teamTitle")}</h3>
            <p className="text-sm text-muted-foreground">
              {isOwner ? t("settings.teamSubtitle") : t("settings.team.ownerOnly")}
            </p>
          </div>
        </div>
        {isOwner && (
          <Button size="sm" onClick={openAdd}>
            <UserPlus className="h-4 w-4" />
            {t("settings.team.add")}
          </Button>
        )}
      </div>

      {!members ? (
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      ) : (
        <div className="space-y-3">
          {members.map((m) => {
            const isSelf = m.user_id === user?.id;
            const label = m.full_name || m.email || t("common.unknownUser");
            const editable = isOwner && !isSelf && (m.role === "admin" || m.role === "viewer");
            return (
              <div
                key={m.member_id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-secondary/50 p-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-pink to-brand-orange text-sm font-semibold text-white">
                    {label.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {label} {isSelf && <span className="text-xs text-muted-foreground">{t("common.you")}</span>}
                    </p>
                    <p className="truncate text-sm text-muted-foreground" dir="ltr">
                      {m.email}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    {t(`roles.${m.role}`)}
                  </span>
                  {m.role !== "owner" && <AccessChips m={m} />}
                  {editable && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => startEdit(m)}
                        aria-label={t("settings.team.edit")}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => void remove(m.member_id)}
                        aria-label={t("settings.removeMember")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isOwner && invites.length > 0 && (
        <div className="mt-6">
          <h4 className="mb-2 text-sm font-medium text-muted-foreground">{t("settings.team.pending")}</h4>
          <div className="space-y-2">
            {invites.map((i) => (
              <div
                key={i.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm" dir="ltr">
                    {i.email}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <AccessChips m={{ role: i.role as Member["role"], permissions: i.permissions }} />
                  </div>
                </div>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => void revoke(i.id)}>
                  {t("settings.team.revoke")}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={adding} onOpenChange={(o) => !o && setAdding(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{link ? t("settings.team.linkTitle") : t("settings.team.addTitle")}</DialogTitle>
            <DialogDescription>
              {link ? t("settings.team.linkHint", { email: link.email }) : t("settings.team.addDesc")}
            </DialogDescription>
          </DialogHeader>
          {link ? (
            <div className="space-y-3">
              <Input readOnly value={link.url} dir="ltr" onFocus={(e) => e.currentTarget.select()} />
              <Button className="w-full" onClick={() => void copy()}>
                <Copy className="h-4 w-4" />
                {t("settings.team.copy")}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="team-email">{t("settings.team.email")}</Label>
                <Input
                  id="team-email"
                  type="email"
                  dir="ltr"
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <AccessPicker value={access} onChange={setAccess} />
              {noPermission && <p className="text-sm text-destructive">{t("settings.team.pickOne")}</p>}
              <Button className="w-full" disabled={busy || !email.trim() || noPermission} onClick={() => void create()}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("settings.team.create")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("settings.team.edit")}</DialogTitle>
            <DialogDescription dir="ltr" className="text-start">
              {editing?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <AccessPicker value={access} onChange={setAccess} />
            {noPermission && <p className="text-sm text-destructive">{t("settings.team.pickOne")}</p>}
            <Button className="w-full" disabled={busy || noPermission} onClick={() => void save()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("common.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
