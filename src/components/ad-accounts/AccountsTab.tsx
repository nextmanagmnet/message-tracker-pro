import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Link2, Loader2, RefreshCw, Search } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { invokeFn, useFormat } from "@/components/leads/shared";
import { cn } from "@/lib/utils";
import { InviteLinksDialog } from "./InviteLinksDialog";
import { MAX_BATCH, PAGE_SIZE, type InviteLink, type LinkAccount, type LinkStatus, type ListResult } from "./types";

type Filter = "all" | "not_invited" | "invited" | "joined";

const BADGE: Record<LinkStatus, string> = {
  not_invited: "text-muted-foreground",
  invited: "border-warning/50 text-warning",
  joined: "border-success/50 text-success",
  revoked: "text-muted-foreground",
};

export function AccountsTab({
  agencyId,
  agencyName,
  canManage,
}: {
  agencyId: string;
  agencyName: string;
  canManage: boolean;
}) {
  const { t } = useTranslation("agencylinks");
  const f = useFormat();
  const [data, setData] = useState<ListResult | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null); // "refresh" | "invite" | advertiserId
  const [links, setLinks] = useState<InviteLink[] | null>(null);
  const [unlinking, setUnlinking] = useState<LinkAccount | null>(null);
  const autoRefreshed = useRef(false);

  const load = useCallback(async () => {
    try {
      setData(await invokeFn<ListResult>("agency-links", { action: "list", agencyId }));
    } catch (e) {
      setData({ needsRefresh: false, accounts: [], counts: { total: 0, notInvited: 0, invited: 0, joined: 0 } });
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  }, [agencyId, t]);

  const run = useCallback(
    async (key: string, fn: () => Promise<void>) => {
      setBusy(key);
      try {
        await fn();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("common.error"));
      } finally {
        setBusy(null);
      }
    },
    [t],
  );

  const refresh = useCallback(
    () =>
      run("refresh", async () => {
        const r = await invokeFn<{ accounts: number }>("agency-links", { action: "refresh", agencyId });
        toast.success(t("accounts.refreshed", { count: r.accounts }));
        await load();
      }),
    [agencyId, load, run, t],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (data?.needsRefresh && canManage && !autoRefreshed.current) {
      autoRefreshed.current = true;
      refresh();
    }
  }, [data, canManage, refresh]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.accounts ?? []).filter((a) => {
      const st = a.status === "revoked" ? "not_invited" : a.status;
      if (filter !== "all" && st !== filter) return false;
      return !q || a.name.toLowerCase().includes(q) || a.advertiserId.includes(q);
    });
  }, [data, filter, search]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const allVisible = visible.length > 0 && visible.every((a) => selected.has(a.advertiserId));

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const toggleVisible = (on: boolean) => {
    const next = new Set(selected);
    for (const a of visible) {
      if (!on) next.delete(a.advertiserId);
      else if (next.size < MAX_BATCH || next.has(a.advertiserId)) next.add(a.advertiserId);
      else {
        toast.warning(t("accounts.maxBatch", { max: MAX_BATCH }));
        break;
      }
    }
    setSelected(next);
  };

  const invite = (ids: string[]) =>
    run(ids.length === 1 ? ids[0] : "invite", async () => {
      const r = await invokeFn<{ links: InviteLink[] }>("agency-links", {
        action: "invite",
        agencyId,
        advertiserIds: ids,
      });
      setLinks(r.links);
      setSelected(new Set());
      await load();
    });

  const revoke = (a: LinkAccount) =>
    run(a.advertiserId, async () => {
      await invokeFn("agency-links", { action: "revoke-invite", agencyId, inviteId: a.inviteId });
      toast.success(t("accounts.revoked"));
      await load();
    });

  const unlink = (a: LinkAccount) => {
    setUnlinking(null);
    return run(a.advertiserId, async () => {
      await invokeFn("agency-links", { action: "unlink", agencyId, linkId: a.linkId });
      toast.success(t("accounts.unlinked"));
      await load();
    });
  };

  if (!data) return <Skeleton className="h-64 w-full" />;

  if (data.counts.total === 0 && !data.needsRefresh) {
    return (
      <div className="glass-card flex flex-col items-center gap-3 p-10 text-center">
        <Link2 className="h-8 w-8 text-muted-foreground" aria-hidden />
        <h2 className="text-lg font-semibold">{t("noBc.title")}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{t("noBc.body")}</p>
        <Button asChild variant="glow">
          <Link to="/funding">{t("noBc.cta")}</Link>
        </Button>
      </div>
    );
  }

  const chips: { key: Filter; label: string; n: number }[] = [
    { key: "all", label: t("chips.total"), n: data.counts.total },
    { key: "not_invited", label: t("chips.notInvited"), n: data.counts.notInvited },
    { key: "invited", label: t("chips.invited"), n: data.counts.invited },
    { key: "joined", label: t("chips.joined"), n: data.counts.joined },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-pressed={filter === c.key}
            onClick={() => {
              setFilter(c.key);
              setPage(1);
            }}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition-colors",
              filter === c.key
                ? "border-primary bg-primary/10 text-foreground"
                : "text-muted-foreground hover:border-primary/40",
            )}
          >
            {c.label} <span className="font-semibold tabular-nums">{f.num(c.n)}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            className="ps-10"
            value={search}
            aria-label={t("accounts.search")}
            placeholder={t("accounts.search")}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        {canManage && (
          <>
            <Button variant="outline" onClick={refresh} disabled={busy === "refresh"}>
              {busy === "refresh" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t("accounts.refresh")}
            </Button>
            {selected.size > 0 && (
              <>
                <Button variant="glow" onClick={() => invite([...selected])} disabled={busy === "invite"}>
                  {busy === "invite" && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("accounts.inviteSelected")} ({f.num(selected.size)})
                </Button>
                <Button variant="ghost" onClick={() => setSelected(new Set())}>
                  {t("accounts.clearSelection")}
                </Button>
              </>
            )}
          </>
        )}
      </div>

      <div className="glass-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {canManage && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={allVisible}
                    onCheckedChange={(v) => toggleVisible(v === true)}
                    aria-label={t("accounts.selectAll")}
                  />
                </TableHead>
              )}
              <TableHead>{t("accounts.columns.name")}</TableHead>
              <TableHead>{t("accounts.columns.bc")}</TableHead>
              <TableHead>{t("accounts.columns.status")}</TableHead>
              {canManage && <TableHead className="text-end">{t("accounts.columns.actions")}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  {t("accounts.none")}
                </TableCell>
              </TableRow>
            )}
            {visible.map((a) => (
              <TableRow key={a.advertiserId}>
                {canManage && (
                  <TableCell>
                    <Checkbox
                      checked={selected.has(a.advertiserId)}
                      onCheckedChange={(v) => {
                        if (v === true && selected.size >= MAX_BATCH)
                          return toast.warning(t("accounts.maxBatch", { max: MAX_BATCH }));
                        toggle(a.advertiserId, v === true);
                      }}
                      aria-label={t("accounts.selectRow", { name: a.name })}
                    />
                  </TableCell>
                )}
                <TableCell>
                  <p className="font-medium">{a.name}</p>
                  <p className="text-xs text-muted-foreground" dir="ltr">
                    {a.advertiserId}
                  </p>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{a.bcName ?? a.bcId}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={BADGE[a.status]}>
                    {t(`status.${a.status}`)}
                  </Badge>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {a.status === "invited" && a.invitedAt && t("accounts.invitedOn", { date: f.date(a.invitedAt) })}
                    {a.status === "invited" &&
                      a.expiresAt &&
                      ` · ${t("accounts.expires", { date: f.date(a.expiresAt) })}`}
                    {a.status === "joined" && a.linkedAt && t("accounts.linkedOn", { date: f.date(a.linkedAt) })}
                  </p>
                </TableCell>
                {canManage && (
                  <TableCell className="text-end">
                    <div className="flex flex-wrap justify-end gap-1">
                      {a.status !== "joined" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy !== null}
                          onClick={() => invite([a.advertiserId])}
                        >
                          {busy === a.advertiserId && <Loader2 className="h-4 w-4 animate-spin" />}
                          {a.status === "not_invited" ? t("accounts.invite") : t("accounts.reinvite")}
                        </Button>
                      )}
                      {a.status === "invited" && a.inviteId && (
                        <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => revoke(a)}>
                          {t("accounts.revoke")}
                        </Button>
                      )}
                      {a.status === "joined" && a.linkId && (
                        <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => setUnlinking(a)}>
                          {t("accounts.unlink")}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <Button variant="outline" size="sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>
            {t("accounts.prev")}
          </Button>
          <span className="text-muted-foreground">{t("accounts.page", { page: current, pages })}</span>
          <Button variant="outline" size="sm" disabled={current >= pages} onClick={() => setPage(current + 1)}>
            {t("accounts.next")}
          </Button>
        </div>
      )}

      <InviteLinksDialog links={links} agencyName={agencyName} onClose={() => setLinks(null)} />

      <AlertDialog open={!!unlinking} onOpenChange={(o) => !o && setUnlinking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("accounts.unlinkTitle", { name: unlinking?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("accounts.unlinkBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => unlinking && unlink(unlinking)}>
              {t("accounts.confirmUnlink")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
