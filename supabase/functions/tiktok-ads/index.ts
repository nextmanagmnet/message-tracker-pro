import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeClient } from "../_shared/auth.ts";
import { corsHeaders, json } from "../_shared/cron.ts";
import { withCors } from "../_shared/cors.ts";
import { hasLlm, jsonCompletion, REPLY_MODEL } from "../_shared/llm.ts";
import { TikTokApiError, tiktokApi } from "../_shared/tiktokApi.ts";
import { ensurePixel } from "../_shared/tiktokPixel.ts";
import {
  adBody,
  adGroupBody,
  campaignBody,
  CTAS,
  type Creative,
  goLink,
  type Identity,
  isScopeError,
  MAX_AD_TEXT,
  MAX_ADS,
  MAX_DAILY_BUDGET,
  parseSuggestion,
  reviewSummary,
  SUGGESTION_SCHEMA,
  validateLaunch,
} from "../_shared/tiktokAds.ts";

// AI campaign launcher: builds a TikTok lead-generation campaign that lands on WOB's WhatsApp link.
// Body: { action, clientId, ... }. Agency owners/admins only; the TikTok token never leaves the server.
// Nothing spends unless the request carries confirm: true (the wizard's explicit Launch / Resume click).

type Row = Record<string, unknown>;
const REGION_PARAMS = { placements: JSON.stringify(["PLACEMENT_TIKTOK"]), objective_type: "LEAD_GENERATION" };
const VIDEO_EXT = ["mp4", "mov", "mpeg", "avi", "webm"];
const IMAGE_EXT = ["jpg", "jpeg", "png"];

const RECONNECT = "Reconnect TikTok on the Connections page to allow this (new permissions were approved).";
const errorText = (e: unknown) =>
  e instanceof TikTokApiError && isScopeError(e.code) ? RECONNECT : e instanceof Error ? e.message : String(e);

// Runs a TikTok read that may be blocked by a missing scope; the wizard shows a "reconnect" state instead.
async function attempt<T>(fn: () => Promise<T>): Promise<{ data: T | null; reconnect: boolean; error: string | null }> {
  try {
    return { data: await fn(), reconnect: false, error: null };
  } catch (e) {
    const reconnect = e instanceof TikTokApiError && isScopeError(e.code);
    return { data: null, reconnect, error: reconnect ? RECONNECT : errorText(e) };
  }
}

async function isAgencyAdmin(supabase: SupabaseClient, userId: string, clientId: string) {
  const { data: client } = await supabase.from("clients").select("agency_id").eq("id", clientId).maybeSingle();
  if (!client) return false;
  const roles = await Promise.all(
    ["owner", "admin"].map((role) =>
      supabase.rpc("has_agency_role", { _user_id: userId, _agency_id: client.agency_id, _role: role }),
    ),
  );
  return roles.some((r) => r.data === true);
}

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    try {
      const body = await req.json().catch(() => ({}));
      const auth = await authorizeClient(req, body.clientId);
      if (auth instanceof Response) return auth;
      const { supabase, userId } = auth;
      const clientId: string = body.clientId;
      if (!(await isAgencyAdmin(supabase, userId, clientId)))
        return json({ error: "Only agency owners and admins can launch campaigns" }, 403);

      const { data: account } = await supabase
        .from("tiktok_accounts")
        .select("advertiser_id, access_token")
        .eq("client_id", clientId)
        .limit(1)
        .maybeSingle();
      if (!account?.access_token)
        return json({ error: "Connect a TikTok ad account first", code: "not_connected" }, 400);
      const advertiserId: string = account.advertiser_id;
      const base = { advertiser_id: advertiserId };
      const get = <T = Row>(path: string, params: Record<string, unknown> = {}) =>
        tiktokApi<T>(path, account.access_token, {
          params: Object.fromEntries(
            Object.entries({ ...base, ...params }).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]),
          ),
        });
      const post = <T = Row>(path: string, b: Record<string, unknown>) =>
        tiktokApi<T>(path, account.access_token, { body: { ...base, ...b } });

      // Recent ads: identities and ad-library videos (with covers) that already ran on this account.
      const recentAds = async () =>
        (
          await get<{ list?: Row[] }>("ad/get/", {
            page_size: 50,
            fields: [
              "ad_id",
              "ad_name",
              "video_id",
              "image_ids",
              "identity_id",
              "identity_type",
              "identity_authorized_bc_id",
            ],
          })
        ).list ?? [];

      // Uploads a picture TikTok can fetch by URL; returns its image id.
      const uploadImage = async (url: string) =>
        String(
          (
            await post<Row>("file/image/ad/upload/", {
              upload_type: "UPLOAD_BY_URL",
              image_url: url,
              file_name: crypto.randomUUID(),
            })
          ).image_id ?? "",
        );

      // A video's cover as an ad image: reuse one an earlier ad used, else upload TikTok's poster frame.
      const coverFor = async (videoId: string, ads?: Row[]): Promise<string[]> => {
        const used = (ads ?? []).find((a) => a.video_id === videoId && Array.isArray(a.image_ids));
        if (used) return used.image_ids as string[];
        const info = await get<{ list?: Row[] }>("file/video/ad/info/", { video_ids: [videoId] });
        const poster = info.list?.[0]?.video_cover_url;
        if (typeof poster !== "string") throw new Error("TikTok has no cover for this video yet; try again shortly");
        return [await uploadImage(poster)];
      };

      // mediaIds: an ad_media row id, "video:<ad-library id>" or "spark:<TikTok post id>".
      const resolveCreatives = async (mediaIds: string[]): Promise<Creative[]> => {
        let ads: Row[] | undefined;
        const out: Creative[] = [];
        for (const m of mediaIds) {
          if (m.startsWith("spark:")) {
            out.push({ tiktokItemId: m.slice(6) });
            continue;
          }
          let videoId = m.startsWith("video:") ? m.slice(6) : "";
          let imageIds: string[] = [];
          if (!videoId) {
            const { data: media } = await supabase
              .from("ad_media")
              .select("kind, status, tiktok_video_id, tiktok_image_id")
              .eq("id", m)
              .eq("client_id", clientId)
              .maybeSingle();
            if (!media || media.status !== "ready") throw new Error("A chosen video is not ready on TikTok yet");
            if (media.kind !== "video" || !media.tiktok_video_id)
              throw new Error("TikTok ads need a video; pictures are used as the cover only");
            videoId = media.tiktok_video_id;
            imageIds = media.tiktok_image_id ? [media.tiktok_image_id] : [];
          }
          // Earlier ads only save an upload; without the Ads Management scope fall back to the poster frame.
          if (!imageIds.length) imageIds = await coverFor(videoId, (ads ??= await recentAds().catch((): Row[] => [])));
          out.push({ videoId, imageIds });
        }
        return out;
      };

      const pixelIdFor = async (pixelCode: string) => {
        const d = await get<{ pixels?: Row[] }>("pixel/list/", { code: pixelCode });
        const id = d.pixels?.[0]?.pixel_id;
        if (!id) throw new Error("TikTok did not return the pixel; try again in a minute");
        return String(id);
      };

      const loadLaunch = async (id: unknown) => {
        const { data } = await supabase
          .from("ad_launches")
          .select("*")
          .eq("id", typeof id === "string" ? id : "")
          .eq("client_id", clientId)
          .maybeSingle();
        return data;
      };

      const { action } = body;

      if (action === "options") {
        const [identities, ads, library, info, pixel, numbers] = await Promise.all([
          attempt(() => get<{ identity_list?: Row[] }>("identity/get/", { page_size: 100 })),
          attempt(recentAds),
          attempt(() => get<{ list?: Row[] }>("file/video/ad/search/", { page_size: 50 })),
          attempt(() =>
            get<{ list?: Row[] }>("advertiser/info/", {
              advertiser_ids: [advertiserId],
              fields: ["balance", "currency", "country"],
            }),
          ),
          attempt(() => ensurePixel(supabase, clientId)),
          supabase
            .from("whatsapp_numbers")
            .select("id, phone_number")
            .eq("client_id", clientId)
            .eq("status", "connected"),
        ]);
        const fromAds = ads.data ?? [];
        // identity/get needs a newer scope; until then reuse the identities earlier ads ran from.
        const ids = new Map<string, Identity & { name: string | null }>();
        for (const i of identities.data?.identity_list ?? [])
          ids.set(String(i.identity_id), {
            id: String(i.identity_id),
            type: String(i.identity_type),
            bcId: i.identity_authorized_bc_id ? String(i.identity_authorized_bc_id) : null,
            name: typeof i.display_name === "string" ? i.display_name : null,
          });
        for (const a of fromAds)
          if (a.identity_id && !ids.has(String(a.identity_id)))
            ids.set(String(a.identity_id), {
              id: String(a.identity_id),
              type: String(a.identity_type),
              bcId: a.identity_authorized_bc_id ? String(a.identity_authorized_bc_id) : null,
              name: null,
            });
        const videos = new Map<string, { id: string; name: string | null; cover: string | null }>();
        for (const v of library.data?.list ?? [])
          videos.set(String(v.video_id), {
            id: String(v.video_id),
            name: typeof v.file_name === "string" ? v.file_name : null,
            cover: typeof v.video_cover_url === "string" ? v.video_cover_url : null,
          });
        for (const a of fromAds)
          if (a.video_id && !videos.has(String(a.video_id)))
            videos.set(String(a.video_id), {
              id: String(a.video_id),
              name: (a.ad_name as string) ?? null,
              cover: null,
            });
        const adv = info.data?.list?.[0];
        return json({
          identities: [...ids.values()],
          videos: [...videos.values()],
          numbers: numbers.data ?? [],
          pixel: pixel.data,
          pixelError: pixel.error,
          balance: adv ? { amount: Number(adv.balance ?? 0), currency: String(adv.currency ?? "USD") } : null,
          country: typeof adv?.country === "string" ? adv.country : null,
          ctas: CTAS,
          maxBudget: Number(Deno.env.get("LAUNCH_MAX_DAILY_BUDGET")) || MAX_DAILY_BUDGET,
          // Which features the stored token cannot use yet (the user must reconnect TikTok).
          reconnect: {
            identities: identities.reconnect,
            library: library.reconnect,
            upload: library.reconnect, // upload and library come with the same creative scope
            ads: ads.reconnect, // Ads Management: creating and reading campaigns
          },
        });
      }

      if (action === "regions") {
        // Countries, or the provinces/cities of one country (by its ISO code).
        // ponytail: the city-level list is ~4 MB for the whole world; cache it if this gets slow.
        const country = typeof body.country === "string" ? body.country.toUpperCase() : "";
        const d = await get<{ region_info?: Row[] }>("tool/region/", {
          ...REGION_PARAMS,
          level_range: country ? "TO_CITY" : "TO_COUNTRY",
          language: body.language === "ar" ? "ar" : "en",
        });
        const regions = (d.region_info ?? [])
          .filter((r) => (country ? r.region_code === country && r.level !== "COUNTRY" : r.level === "COUNTRY"))
          .map((r) => ({
            id: String(r.location_id),
            name: String(r.name),
            code: String(r.region_code),
            level: r.level,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        return json({ regions });
      }

      if (action === "upload-media") {
        const path = typeof body.storagePath === "string" ? body.storagePath : "";
        const productUrl = typeof body.productUrl === "string" ? body.productUrl : "";
        const catalogPrefix = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/catalog/${clientId}/`;
        if (path ? !path.startsWith(`${clientId}/`) || path.includes("..") : !productUrl.startsWith(catalogPrefix))
          return json({ error: "Upload the file to this client's media first" }, 400);
        const ext = (path || productUrl).split("?")[0].split(".").pop()?.toLowerCase() ?? "";
        const kind = VIDEO_EXT.includes(ext) ? "video" : IMAGE_EXT.includes(ext) ? "image" : null;
        if (!kind) return json({ error: "Use an MP4/MOV video or a JPG/PNG picture" }, 400);

        const { data: media, error } = await supabase
          .from("ad_media")
          .insert({
            client_id: clientId,
            kind,
            storage_path: path || productUrl,
            file_name: typeof body.fileName === "string" ? body.fileName.slice(0, 200) : null,
            status: "processing",
          })
          .select()
          .single();
        if (error || !media) return json({ error: "Could not save the media" }, 500);
        try {
          let url = productUrl;
          if (path) {
            const signed = await supabase.storage.from("ad-media").createSignedUrl(path, 3600);
            if (!signed.data?.signedUrl) throw new Error("The uploaded file was not found");
            url = signed.data.signedUrl;
          }
          const patch: Row = { status: "ready", error: null };
          if (kind === "video") {
            const d = await post<Row[] | { list?: Row[] }>("file/video/ad/upload/", {
              upload_type: "UPLOAD_BY_URL",
              video_url: url,
              file_name: media.id,
            });
            const v = (Array.isArray(d) ? d[0] : d.list?.[0]) ?? {};
            patch.tiktok_video_id = String(v.video_id ?? "");
            if (!patch.tiktok_video_id) throw new Error("TikTok did not return the video id");
            patch.tiktok_image_id =
              typeof v.video_cover_url === "string"
                ? await uploadImage(v.video_cover_url)
                : ((await coverFor(String(patch.tiktok_video_id)))[0] ?? null);
          } else {
            patch.tiktok_image_id = await uploadImage(url);
          }
          const { data: saved } = await supabase.from("ad_media").update(patch).eq("id", media.id).select().single();
          return json({ media: saved });
        } catch (e) {
          const message = errorText(e);
          await supabase.from("ad_media").update({ status: "failed", error: message }).eq("id", media.id);
          return json({ error: message }, 502);
        }
      }

      if (action === "ai-suggest") {
        if (!hasLlm()) return json({ error: "AI is not configured" }, 503);
        const [{ data: settings }, { data: products }, { data: client }] = await Promise.all([
          supabase
            .from("ai_agent_settings")
            .select("business_knowledge, tone, tone_profile")
            .eq("client_id", clientId)
            .maybeSingle(),
          supabase
            .from("products")
            .select("id, name, description, price, currency, in_stock")
            .eq("client_id", clientId)
            .order("created_at", { ascending: false })
            .limit(15),
          supabase.from("clients").select("name").eq("id", clientId).maybeSingle(),
        ]);
        const product = (products ?? []).find((p) => p.id === body.productId);
        const language = body.language === "ar" ? "Arabic" : "English";
        const goal = typeof body.goal === "string" ? body.goal.slice(0, 300) : "";
        const raw = await jsonCompletion({
          model: REPLY_MODEL,
          effort: "low",
          maxTokens: 1024,
          schema: SUGGESTION_SCHEMA,
          system:
            `You write TikTok in-feed ads for a small business. People tap the ad and land in a WhatsApp chat with the business. ` +
            `Return exactly 3 different ad texts in ${language}, each at most ${MAX_AD_TEXT} characters, no hashtags, no emojis, ` +
            `no prices or claims that are not in the business info. Also return the short first WhatsApp message the customer sends ` +
            `(in ${language}, written as the customer, e.g. asking about the product), the most likely target country as an ` +
            `ISO 3166-1 alpha-2 code, an age range (18 or older) and a gender (GENDER_UNLIMITED unless the product is clearly for one gender).`,
          user: JSON.stringify({
            business: client?.name ?? "",
            about: settings?.business_knowledge ?? "",
            tone: settings?.tone_profile ?? settings?.tone ?? "",
            goal,
            promote: product ?? null,
            catalog: (products ?? []).map((p) => ({ name: p.name, price: p.price, currency: p.currency })),
          }),
        });
        const suggestion = parseSuggestion(raw);
        if (!suggestion) return json({ error: "The AI could not suggest an ad; try again or write your own" }, 502);
        return json({ suggestion });
      }

      if (action === "launch") {
        const cap = Number(Deno.env.get("LAUNCH_MAX_DAILY_BUDGET")) || MAX_DAILY_BUDGET;
        const v = validateLaunch(body, cap);
        if (!v.ok) return json({ error: v.error }, 400);
        const input = v.value;
        const enabled = body.confirm === true;

        // Idempotent on the wizard's launch id: a retry resumes from the last TikTok object created.
        const { data: other } = await supabase
          .from("ad_launches")
          .select("client_id")
          .eq("id", input.launchId)
          .maybeSingle();
        if (other && other.client_id !== clientId) return json({ error: "Access denied" }, 403);
        const prev = await loadLaunch(input.launchId);
        if (prev?.status === "launched") return json({ launch: prev });
        if (prev?.status === "launching" && Date.now() - Date.parse(prev.updated_at) < 120_000)
          return json({ error: "This campaign is already being launched" }, 409);

        const setLaunch = async (patch: Row) => {
          const { data } = await supabase
            .from("ad_launches")
            .upsert({ id: input.launchId, client_id: clientId, ...patch, updated_at: new Date().toISOString() })
            .select()
            .single();
          return data;
        };
        await setLaunch({ status: "launching", error: null, created_by: prev?.created_by ?? userId, params: input });

        try {
          const { data: number } = await supabase
            .from("whatsapp_numbers")
            .select("phone_number")
            .eq("id", input.whatsappNumberId)
            .eq("client_id", clientId)
            .eq("status", "connected")
            .maybeSingle();
          if (!number) throw new Error("The chosen WhatsApp number is not connected");
          const { pixelCode } = await ensurePixel(supabase, clientId);
          const pixelId = await pixelIdFor(pixelCode);
          const creatives = await resolveCreatives(input.mediaIds); // before creating anything on TikTok
          const origin = (Deno.env.get("APP_ORIGINS") ?? "https://wob-platform.vercel.app").split(",")[0].trim();
          const landingUrl = goLink(origin, number.phone_number, input.message, pixelCode);
          const params = { ...input, pixelId, landingUrl, operation: enabled ? "ENABLE" : "DISABLE" };

          let campaignId: string | null = prev?.tiktok_campaign_id ?? null;
          if (!campaignId) {
            const c = await post<Row>("campaign/create/", campaignBody(advertiserId, input.name, enabled));
            campaignId = String(c.campaign_id);
            await setLaunch({ tiktok_campaign_id: campaignId, params });
          }
          let adgroupId: string | null = prev?.tiktok_adgroup_id ?? null;
          if (!adgroupId) {
            const g = await post<Row>(
              "adgroup/create/",
              adGroupBody(advertiserId, campaignId, input, pixelId, enabled, new Date()),
            );
            adgroupId = String(g.adgroup_id);
            await setLaunch({ tiktok_adgroup_id: adgroupId });
          }
          let adIds: string[] = prev?.tiktok_ad_ids ?? [];
          if (!adIds.length) {
            const a = await post<{ ad_ids?: string[] }>(
              "ad/create/",
              adBody(advertiserId, adgroupId, { ...input, creatives, landingUrl, pixelId, enabled }),
            );
            adIds = (a.ad_ids ?? []).map(String);
          }
          return json({ launch: await setLaunch({ status: "launched", tiktok_ad_ids: adIds, params, error: null }) });
        } catch (e) {
          const message = errorText(e);
          return json({ error: message, launch: await setLaunch({ status: "failed", error: message }) }, 502);
        }
      }

      const launch = await loadLaunch(body.launchId);
      if (["status", "set-status", "add-ads"].includes(action) && !launch?.tiktok_campaign_id)
        return json({ error: "Launch not found" }, 404);

      if (action === "status" && launch) {
        const [campaign, ads] = await Promise.all([
          get<{ list?: Row[] }>("campaign/get/", {
            filtering: { campaign_ids: [launch.tiktok_campaign_id] },
            fields: ["campaign_id", "operation_status", "secondary_status"],
          }),
          launch.tiktok_adgroup_id
            ? get<{ list?: Row[] }>("ad/get/", {
                filtering: { adgroup_ids: [launch.tiktok_adgroup_id], primary_status: "STATUS_ALL" },
                fields: ["ad_id", "ad_name", "secondary_status", "operation_status"],
              })
            : Promise.resolve({ list: [] as Row[] }),
        ]);
        const list = ads.list ?? [];
        const review = list.length
          ? await get<{ ad_review_map?: Row }>("ad/review_info/", { ad_ids: list.map((a) => String(a.ad_id)) })
          : {};
        const c = campaign.list?.[0];
        return json({
          launch,
          campaign: c ? { status: c.secondary_status ?? null, operation: c.operation_status ?? null } : null,
          ads: reviewSummary(list, review.ad_review_map ?? {}),
        });
      }

      if (action === "set-status" && launch) {
        const to = ({ pause: "DISABLE", resume: "ENABLE", delete: "DELETE" } as Record<string, string>)[body.status];
        if (!to) return json({ error: "status must be pause, resume or delete" }, 400);
        if (to === "ENABLE" && body.confirm !== true) return json({ error: "Resuming spends budget; confirm it" }, 400);
        await post("campaign/status/update/", { campaign_ids: [launch.tiktok_campaign_id], operation_status: to });
        if (to === "ENABLE") {
          // A launch created without confirm has its ad group and ads paused too.
          if (launch.tiktok_adgroup_id)
            await post("adgroup/status/update/", { adgroup_ids: [launch.tiktok_adgroup_id], operation_status: to });
          if (launch.tiktok_ad_ids.length)
            await post("ad/status/update/", { ad_ids: launch.tiktok_ad_ids, operation_status: to });
        }
        const { data } = await supabase
          .from("ad_launches")
          .update({ params: { ...(launch.params as Row), operation: to }, updated_at: new Date().toISOString() })
          .eq("id", launch.id)
          .select()
          .single();
        return json({ launch: data });
      }

      if (action === "add-ads" && launch) {
        const p = launch.params as Row;
        if (!launch.tiktok_adgroup_id || typeof p.landingUrl !== "string" || typeof p.pixelId !== "string")
          return json({ error: "This launch has no ad group to add to" }, 400);
        const mediaIds = Array.isArray(body.mediaIds) ? body.mediaIds.map(String) : [];
        const texts = (Array.isArray(body.texts) ? body.texts.map(String) : [])
          .map((t: string) => t.trim())
          .filter(Boolean);
        if (!mediaIds.length || !texts.length) return json({ error: "Add a video and an ad text" }, 400);
        if (texts.some((t: string) => t.length > MAX_AD_TEXT))
          return json({ error: `Ad texts must be ${MAX_AD_TEXT} characters or less` }, 400);
        if (launch.tiktok_ad_ids.length + mediaIds.length * texts.length > MAX_ADS)
          return json({ error: `At most ${MAX_ADS} ads per launch` }, 400);
        const creatives = await resolveCreatives(mediaIds);
        const a = await post<{ ad_ids?: string[] }>(
          "ad/create/",
          adBody(advertiserId, launch.tiktok_adgroup_id, {
            name: String(p.name ?? "WOB"),
            creatives,
            texts,
            identity: p.identity as Identity,
            landingUrl: p.landingUrl,
            pixelId: p.pixelId,
            cta: String(p.cta ?? "CONTACT_US"),
            enabled: body.confirm === true,
          }),
        );
        const { data } = await supabase
          .from("ad_launches")
          .update({
            tiktok_ad_ids: [...launch.tiktok_ad_ids, ...(a.ad_ids ?? []).map(String)],
            updated_at: new Date().toISOString(),
          })
          .eq("id", launch.id)
          .select()
          .single();
        return json({ launch: data });
      }

      return json({ error: "Unknown action" }, 400);
    } catch (e) {
      console.error("tiktok-ads failed", e instanceof Error ? e.message : e);
      return json({ error: errorText(e) }, e instanceof TikTokApiError ? 502 : 500);
    }
  }),
);
