import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw, Sparkles, Trash2, Unplug } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAgency } from "@/hooks/useAgency";
import { invokeFn, useFormat } from "@/components/leads/shared";

type Source = "buyers" | "qualified";
type Size = "NARROW" | "BALANCED" | "BROAD";
type Audience = {
  id: string;
  name: string;
  source: Source;
  tiktok_audience_id: string | null;
  tiktok_lookalike_id: string | null;
  member_count: number | null;
  status: "pending" | "syncing" | "ready" | "failed";
  error: string | null;
  last_synced_at: string | null;
};
type ListResult = {
  audiences: Audience[];
  connected: boolean;
  counts: Record<Source, number>;
  minSize: number;
};

const RECONNECT = "RECONNECT_TIKTOK"; // the function's error for a missing/expired token or missing scope
const SIZES: Size[] = ["NARROW", "BALANCED", "BROAD"];
const STATUS_VARIANT = { ready: "default", syncing: "secondary", pending: "secondary", failed: "destructive" } as const;

const Audiences = () => {
  const { t } = useTranslation("audiences");
  const f = useFormat();
  const { selectedClient, canManage } = useAgency();
  const clientId = selectedClient?.id;
  const [data, setData] = useState<ListResult | null>(null);
  const [reconnect, setReconnect] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // audience id or "create"
  const [creating, setCreating] = useState<Source | null>(null);
  const [name, setName] = useState("");
  const [lookalike, setLookalike] = useState(false);
  const [size, setSize] = useState<Size>("BALANCED");

  const load = useCallback(async () => {
    if (!clientId) return;
    try {
      const d = await invokeFn<ListResult>("tiktok-audiences", { action: "list", clientId });
      setData(d);
      setReconnect(!d.connected);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error"));
    }
  }, [clientId, t]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  // Runs an action; a token/scope problem switches the page to its "reconnect TikTok" state.
  const run = async <T,>(key: string, body: Record<string, unknown>): Promise<T | null> => {
    setBusy(key);
    try {
      return await invokeFn<T>("tiktok-audiences", { ...body, clientId });
    } catch (e) {
      const message = e instanceof Error ? e.message : t("error");
      if (message === RECONNECT) setReconnect(true);
      else toast.error(message);
      return null;
    } finally {
      setBusy(null);
      load();
    }
  };

  const openCreate = (source: Source) => {
    setName(`${t(`source.${source}`)} – ${new Date().toISOString().slice(0, 10)}`);
    setLookalike(false);
    setCreating(source);
  };

  const create = async () => {
    if (!creating) return;
    const source = creating;
    setCreating(null);
    const r = await run<{ audience: Audience }>("create", { action: "create", source, name });
    if (!r) return;
    toast.success(t("created"));
    if (!lookalike) return;
    if ((r.audience.member_count ?? 0) < (data?.minSize ?? 1000)) toast.info(t("lookalikeLater"));
    else await run("lookalike", { action: "lookalike", id: r.audience.id, size });
  };

  const remove = async (a: Audience) => {
    if (!confirm(t("confirmDelete", { name: a.name }))) return;
    await run(a.id, { action: "delete", id: a.id });
  };

  const minSize = data?.minSize ?? 1000;
  const counts = data?.counts ?? { buyers: 0, qualified: 0 };

  return (
    <DashboardLayout
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        canManage && data && !reconnect ? (
          <div className="flex flex-wrap gap-2">
            {(["buyers", "qualified"] as const).map((s) => (
              <Button key={s} size="sm" disabled={!counts[s] || !!busy} onClick={() => openCreate(s)}>
                <Plus className="h-4 w-4" />
                {t(`create.${s}`)}
              </Button>
            ))}
          </div>
        ) : null
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("explain")}</p>

        {!data ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            {reconnect && (
              <div className="rounded-lg border border-warning/40 bg-warning/5 p-4 flex flex-wrap items-center gap-3">
                <Unplug className="h-5 w-5 text-warning" />
                <p className="text-sm flex-1 min-w-[12rem]">{t(data.connected ? "reconnect" : "notConnected")}</p>
                <Button asChild size="sm" variant="outline">
                  <Link to="/connections">{t("reconnectButton")}</Link>
                </Button>
              </div>
            )}
            {!reconnect && counts.buyers === 0 && <p className="text-sm text-muted-foreground">{t("noBuyers")}</p>}
            {data.audiences.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">{t("empty")}</p>
            ) : (
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("col.name")}</TableHead>
                      <TableHead>{t("col.source")}</TableHead>
                      <TableHead>{t("col.members")}</TableHead>
                      <TableHead>{t("col.lookalike")}</TableHead>
                      <TableHead>{t("col.status")}</TableHead>
                      <TableHead>{t("col.synced")}</TableHead>
                      {canManage && <TableHead />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.audiences.map((a) => {
                      const members = a.member_count ?? 0;
                      const small = members < minSize;
                      return (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{a.name}</TableCell>
                          <TableCell>{t(`source.${a.source}`)}</TableCell>
                          <TableCell>
                            {f.num(members)}
                            {small && a.status === "ready" && (
                              <p className="text-xs text-muted-foreground">{t("tooSmall", { min: f.num(minSize) })}</p>
                            )}
                          </TableCell>
                          <TableCell>
                            {a.tiktok_lookalike_id ? (
                              t("yes")
                            ) : canManage && !small && a.status === "ready" ? (
                              <div className="flex items-center gap-1">
                                <Select value={size} onValueChange={(v) => setSize(v as Size)}>
                                  <SelectTrigger className="h-8 w-28">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {SIZES.map((s) => (
                                      <SelectItem key={s} value={s}>
                                        {t(`size.${s}`)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={!!busy}
                                  onClick={() => run(a.id, { action: "lookalike", id: a.id, size })}
                                >
                                  <Sparkles className="h-4 w-4" />
                                  {t("makeLookalike")}
                                </Button>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={STATUS_VARIANT[a.status]}>{t(`status.${a.status}`)}</Badge>
                            {a.status === "failed" && a.error && (
                              <p className="text-xs text-destructive mt-1 max-w-xs break-words">{a.error}</p>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {a.last_synced_at ? f.ago(a.last_synced_at) : "—"}
                          </TableCell>
                          {canManage && (
                            <TableCell>
                              <div className="flex gap-1 justify-end">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  title={t("refresh")}
                                  aria-label={t("refresh")}
                                  disabled={!!busy}
                                  onClick={() => run(a.id, { action: "refresh", id: a.id })}
                                >
                                  {busy === a.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <RefreshCw className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  title={t("delete")}
                                  aria-label={t("delete")}
                                  disabled={!!busy}
                                  onClick={() => remove(a)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            {busy === "create" && (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("uploading")}
              </p>
            )}
          </>
        )}
      </div>

      <Dialog open={!!creating} onOpenChange={(o) => !o && setCreating(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{creating && t(`create.${creating}`)}</DialogTitle>
            <DialogDescription>{creating && t("createHint", { n: f.num(counts[creating]) })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="audience-name">{t("name")}</Label>
              <Input id="audience-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="audience-lookalike" checked={lookalike} onCheckedChange={(v) => setLookalike(v === true)} />
              <Label htmlFor="audience-lookalike">{t("alsoLookalike")}</Label>
            </div>
            {lookalike && (
              <div className="space-y-2">
                <Select value={size} onValueChange={(v) => setSize(v as Size)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SIZES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`size.${s}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t("lookalikeHint", { min: f.num(minSize) })}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(null)}>
              {t("cancel")}
            </Button>
            <Button disabled={!name.trim()} onClick={create}>
              {t("createButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Audiences;
