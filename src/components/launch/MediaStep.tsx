import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, Check, Film, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { invokeFn } from "@/components/leads/shared";
import { cn } from "@/lib/utils";
import type { AdMedia, Options } from "./api";

const MAX_MB = 50; // Supabase Storage's default per-file limit
type Item = { id: string; label: string; cover: string | null };

/**
 * Pick the ad videos: upload a new one, send a product video from the Catalog to TikTok, or reuse a video
 * already in the TikTok ad library. Selected ids go to the launch as ad_media ids or "video:<id>".
 */
export function MediaStep({
  clientId,
  options,
  selected,
  onToggle,
}: {
  clientId: string;
  options: Options;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const { t } = useTranslation("launch");
  const [media, setMedia] = useState<AdMedia[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string; videos: string[] }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const blocked = options.reconnect.upload;

  const load = useCallback(async () => {
    const [m, p] = await Promise.all([
      supabase
        .from("ad_media")
        .select("*")
        .eq("client_id", clientId)
        .eq("kind", "video")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("products").select("id, name, videos").eq("client_id", clientId).limit(50),
    ]);
    setMedia(m.data ?? []);
    setProducts((p.data ?? []).filter((x) => x.videos.length > 0));
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  // The server sends the file to TikTok; it comes back ready (with a cover) or with TikTok's error.
  const sendToTikTok = async (key: string, body: Record<string, unknown>) => {
    setBusy(key);
    try {
      const d = await invokeFn<{ media: AdMedia }>("tiktok-ads", { action: "upload-media", clientId, ...body });
      toast.success(t("media.uploaded"));
      await load();
      if (d.media.status === "ready") onToggle(d.media.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error"));
      await load();
    } finally {
      setBusy(null);
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) return toast.error(t("media.videoOnly"));
    if (file.size > MAX_MB * 1024 * 1024) return toast.error(t("media.tooBig", { mb: MAX_MB }));
    const path = `${clientId}/${crypto.randomUUID()}.${file.name.split(".").pop()?.toLowerCase() || "mp4"}`;
    setBusy("upload");
    const { error } = await supabase.storage.from("ad-media").upload(path, file, { contentType: file.type });
    if (error) {
      setBusy(null);
      return toast.error(t("media.uploadFailed"));
    }
    await sendToTikTok("upload", { storagePath: path, fileName: file.name });
  };

  const items: Item[] = [
    ...media
      .filter((m) => m.status === "ready")
      .map((m) => ({ id: m.id, label: m.file_name ?? t("media.uploadedVideo"), cover: null })),
    ...options.videos.map((v) => ({
      id: `video:${v.id}`,
      label: v.name ?? v.id,
      cover: v.cover,
    })),
  ];
  const failed = media.filter((m) => m.status === "failed").slice(0, 3);

  return (
    <div className="space-y-5">
      {blocked && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>
            {t("reconnect.upload")}{" "}
            <Link to="/connections" className="text-primary underline">
              {t("reconnect.action")}
            </Link>
          </span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline" disabled={blocked || !!busy}>
          <label className={cn("cursor-pointer", (blocked || busy) && "pointer-events-none opacity-50")}>
            {busy === "upload" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {t("media.upload")}
            <input
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              className="sr-only"
              disabled={blocked || !!busy}
              onChange={(e) => {
                upload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </Button>
        <span className="text-xs text-muted-foreground">{t("media.hint", { mb: MAX_MB })}</span>
      </div>

      {products.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-foreground">{t("media.fromCatalog")}</p>
          <div className="flex flex-wrap gap-2">
            {products.flatMap((p) =>
              p.videos.map((url, i) => (
                <Button
                  key={url}
                  size="sm"
                  variant="secondary"
                  disabled={blocked || !!busy}
                  onClick={() => sendToTikTok(url, { productUrl: url, fileName: p.name })}
                >
                  {busy === url ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
                  <span dir="auto">{p.videos.length > 1 ? `${p.name} ${i + 1}` : p.name}</span>
                </Button>
              )),
            )}
          </div>
        </div>
      )}

      {failed.map((m) => (
        <p key={m.id} className="text-xs text-destructive" dir="auto">
          {m.file_name ?? t("media.uploadedVideo")}: {m.error}
        </p>
      ))}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("media.empty")}</p>
      ) : (
        <div>
          <p className="mb-2 text-sm font-medium text-foreground">{t("media.choose")}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((it) => {
              const on = selected.includes(it.id);
              return (
                <button
                  key={it.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onToggle(it.id)}
                  className={cn(
                    "relative overflow-hidden rounded-lg border text-start transition",
                    on ? "border-primary ring-2 ring-primary" : "border-border hover:border-primary/50",
                  )}
                >
                  <div className="flex aspect-[9/16] max-h-48 w-full items-center justify-center bg-secondary/60">
                    {it.cover ? (
                      <img src={it.cover} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <Film className="h-8 w-8 text-muted-foreground" aria-hidden />
                    )}
                  </div>
                  <p className="truncate p-2 text-xs text-foreground" dir="auto">
                    {it.label}
                  </p>
                  {on && (
                    <span className="absolute end-2 top-2 rounded-full bg-primary p-1 text-primary-foreground">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default MediaStep;
