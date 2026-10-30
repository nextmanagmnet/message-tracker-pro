import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ImagePlus, Loader2, Package, Pencil, Plus, Trash2, X } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAgency } from "@/hooks/useAgency";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useFormat } from "@/components/leads/shared";

type Product = Tables<"products">;
type Draft = { id?: string; name: string; description: string; price: string; currency: string; in_stock: boolean; images: string[]; videos: string[] };

const EMPTY: Draft = { name: "", description: "", price: "", currency: "USD", in_stock: true, images: [], videos: [] };
const MAX_MB = 16; // WhatsApp's media limit

const Catalog = () => {
  const { t } = useTranslation("features");
  const f = useFormat();
  const { selectedClient, canManageClient: canManage } = useAgency();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!selectedClient) return;
    const { data, error } = await supabase.from("products").select("*").eq("client_id", selectedClient.id).order("created_at", { ascending: false });
    if (error) toast.error(t("common.error"));
    setProducts(data ?? []);
  }, [selectedClient, t]);

  useEffect(() => {
    load();
  }, [load]);

  const upload = async (files: FileList | null) => {
    if (!files || !selectedClient || !draft) return;
    setBusy(true);
    const images = [...draft.images];
    const videos = [...draft.videos];
    for (const file of Array.from(files)) {
      const isVideo = file.type.startsWith("video/");
      if (!isVideo && !file.type.startsWith("image/")) continue;
      if (file.size > MAX_MB * 1024 * 1024) {
        toast.error(t("catalog.tooBig", { name: file.name, mb: MAX_MB }));
        continue;
      }
      const path = `${selectedClient.id}/${crypto.randomUUID()}.${file.name.split(".").pop()?.toLowerCase() || "bin"}`;
      const { error } = await supabase.storage.from("catalog").upload(path, file, { contentType: file.type });
      if (error) {
        toast.error(t("catalog.uploadFailed"));
        continue;
      }
      (isVideo ? videos : images).push(supabase.storage.from("catalog").getPublicUrl(path).data.publicUrl);
    }
    setDraft((d) => (d ? { ...d, images, videos } : d));
    setBusy(false);
  };

  const save = async () => {
    if (!draft || !selectedClient) return;
    if (!draft.name.trim()) return toast.error(t("catalog.nameRequired"));
    const price = draft.price === "" ? null : Number(draft.price);
    if (price !== null && (!Number.isFinite(price) || price < 0)) return toast.error(t("catalog.badPrice"));
    setBusy(true);
    const row = {
      client_id: selectedClient.id,
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      price,
      currency: draft.currency.toUpperCase().slice(0, 3) || "USD",
      in_stock: draft.in_stock,
      images: draft.images,
      videos: draft.videos,
    };
    const { error } = draft.id
      ? await supabase.from("products").update(row).eq("id", draft.id)
      : await supabase.from("products").insert(row);
    setBusy(false);
    if (error) return toast.error(t("common.error"));
    toast.success(t("catalog.saved"));
    setDraft(null);
    load();
  };

  const remove = async (p: Product) => {
    if (!confirm(t("catalog.confirmDelete", { name: p.name }))) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) return toast.error(t("common.error"));
    // ponytail: media files stay in storage after a delete; add cleanup if storage cost matters.
    load();
  };

  const edit = (p: Product) =>
    setDraft({
      id: p.id, name: p.name, description: p.description ?? "", price: p.price == null ? "" : String(p.price),
      currency: p.currency, in_stock: p.in_stock, images: p.images, videos: p.videos,
    });

  return (
    <DashboardLayout title={t("catalog.title")} subtitle={t("catalog.subtitle")}>
      {!selectedClient ? (
        <div className="glass-card wob-mesh-card p-12 text-center text-muted-foreground">{t("common.selectClient")}</div>
      ) : products === null ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <>
          {canManage && (
            <div className="mb-6 flex justify-end">
              <Button variant="glow" onClick={() => setDraft({ ...EMPTY })}><Plus className="h-4 w-4" /> {t("catalog.add")}</Button>
            </div>
          )}
          {products.length === 0 ? (
            <div className="glass-card wob-mesh-card p-12 text-center">
              <Package className="mx-auto mb-3 h-8 w-8 text-primary" />
              <p className="font-medium text-foreground">{t("catalog.empty")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("catalog.emptyHint")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {products.map((p) => (
                <div key={p.id} className="glass-card overflow-hidden">
                  <div className="aspect-[4/3] bg-secondary/50">
                    {p.images[0] ? (
                      <img src={p.images[0]} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
                    ) : p.videos[0] ? (
                      <video src={p.videos[0]} muted playsInline className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center"><Package className="h-10 w-10 text-muted-foreground" /></div>
                    )}
                  </div>
                  <div className="space-y-1 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-foreground" dir="auto">{p.name}</h3>
                      <span className="shrink-0 font-semibold text-primary">{p.price == null ? "—" : f.money(Number(p.price), p.currency)}</span>
                    </div>
                    {p.description && <p className="line-clamp-2 text-sm text-muted-foreground" dir="auto">{p.description}</p>}
                    <div className="flex items-center justify-between pt-2">
                      <span className={p.in_stock ? "text-xs text-success" : "text-xs text-destructive"}>
                        {p.in_stock ? t("catalog.inStock") : t("catalog.outOfStock")} · {t("catalog.media", { images: p.images.length, videos: p.videos.length })}
                      </span>
                      {canManage && (
                        <span className="flex gap-1">
                          <Button variant="ghost" size="icon" aria-label={t("catalog.edit")} onClick={() => edit(p)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" aria-label={t("catalog.delete")} onClick={() => remove(p)}><Trash2 className="h-4 w-4" /></Button>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && !busy && setDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{draft?.id ? t("catalog.edit") : t("catalog.add")}</DialogTitle></DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="p-name">{t("catalog.name")}</Label>
                <Input id="p-name" dir="auto" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-desc">{t("catalog.description")}</Label>
                <Textarea id="p-desc" dir="auto" rows={3} value={draft.description} placeholder={t("catalog.descriptionHint")} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-[1fr_6rem] gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="p-price">{t("catalog.price")}</Label>
                  <Input id="p-price" type="number" min="0" step="0.01" inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-cur">{t("leads.currency")}</Label>
                  <Input id="p-cur" maxLength={3} value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="p-stock">{t("catalog.inStock")}</Label>
                <Switch id="p-stock" checked={draft.in_stock} onCheckedChange={(v) => setDraft({ ...draft, in_stock: v })} />
              </div>
              <div className="space-y-2">
                <Label>{t("catalog.photosVideos")}</Label>
                <div className="grid grid-cols-4 gap-2">
                  {[...draft.images.map((u) => ["images", u] as const), ...draft.videos.map((u) => ["videos", u] as const)].map(([kind, u]) => (
                    <div key={u} className="relative aspect-square overflow-hidden rounded-lg bg-secondary">
                      {kind === "images" ? <img src={u} alt="" className="h-full w-full object-cover" /> : <video src={u} muted className="h-full w-full object-cover" />}
                      <button
                        type="button"
                        aria-label={t("catalog.removeMedia")}
                        className="absolute end-1 top-1 rounded-full bg-background/80 p-0.5"
                        onClick={() => setDraft({ ...draft, [kind]: draft[kind].filter((x) => x !== u) })}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:bg-secondary/50">
                    {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                    {t("catalog.upload")}
                    <input
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      className="sr-only"
                      disabled={busy}
                      onChange={(e) => {
                        upload(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">{t("catalog.mediaHint", { mb: MAX_MB })}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)} disabled={busy}>{t("catalog.cancel")}</Button>
            <Button variant="glow" onClick={save} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} {t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Catalog;
