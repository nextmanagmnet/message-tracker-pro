import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeClient } from "../_shared/auth.ts";
import { corsHeaders, json } from "../_shared/cron.ts";
import { withCors } from "../_shared/cors.ts";
import {
  dedupe,
  MAX_PRODUCTS,
  parseJsonLd,
  parseMeta,
  parseShopify,
  parseWoo,
  productLinks,
  safeUrl,
  sitemapLocs,
  type SiteProduct,
} from "../_shared/siteProducts.ts";

// Imports a business's products from its website into the catalog.
// Body: { clientId, url }. Reads the shop's own product data (Shopify, WooCommerce, or schema.org markup on the pages),
// copies the pictures into WOB's storage and saves the products. Saving and uploading use the CALLER's own login, so
// the same rules apply as for adding a product by hand (only people who may manage the catalog get through).
// The server only fetches public web pages: every address (and every redirect) must pass safeUrl().

const PAGE_LIMIT = 2_500_000; // bytes read from any page
const IMAGE_LIMIT = 8_000_000;
const COPY_BUDGET_MS = 80_000; // after this, remaining pictures stay linked to the website instead of copied
const IMAGES_PER_PRODUCT = 2;
const UA = "Mozilla/5.0 (compatible; WOBCatalogImport/1.0)";

class Blocked extends Error {}

/** GET with a size cap, a timeout and manual redirects, so a redirect cannot lead somewhere unsafe. */
async function fetchLimited(
  url: string,
  limit: number,
  accept: string,
  timeoutMs = 8000,
): Promise<{ body: Uint8Array; type: string; url: string } | null> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const u = safeUrl(current);
    if (!u) throw new Blocked();
    let res: Response;
    try {
      res = await fetch(u.href, {
        redirect: "manual",
        headers: { "User-Agent": UA, Accept: accept },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return null;
    }
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) return null;
      current = new URL(next, u).href;
      continue;
    }
    if (!res.ok || !res.body) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = res.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > limit) {
          await reader.cancel();
          return null;
        }
        chunks.push(value);
      }
    } catch {
      return null;
    }
    const body = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) {
      body.set(c, at);
      at += c.length;
    }
    return { body, type: res.headers.get("content-type") ?? "", url: u.href };
  }
  return null;
}

const text = (r: { body: Uint8Array } | null) => (r ? new TextDecoder().decode(r.body) : "");
const jsonOf = (r: { body: Uint8Array } | null) => {
  try {
    return r ? JSON.parse(text(r)) : null;
  } catch {
    return null;
  }
};

/** Runs `fn` over `items` with a few at a time. */
async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

async function readProducts(site: URL): Promise<{ source: string; products: SiteProduct[] }> {
  const origin = site.origin;

  const shopify = jsonOf(await fetchLimited(`${origin}/products.json?limit=250`, PAGE_LIMIT, "application/json"));
  if (shopify?.products?.length) {
    const shop = jsonOf(await fetchLimited(`${origin}/meta.json`, 200_000, "application/json"));
    const products = parseShopify(shopify, origin, typeof shop?.currency === "string" ? shop.currency : null);
    if (products.length) return { source: "shopify", products };
  }

  const woo = jsonOf(
    await fetchLimited(`${origin}/wp-json/wc/store/v1/products?per_page=100`, PAGE_LIMIT, "application/json"),
  );
  const wooProducts = parseWoo(woo, origin);
  if (wooProducts.length) return { source: "woocommerce", products: wooProducts };

  // Any other site: product data in the page itself, then in the product pages the sitemap points to.
  const page = await fetchLimited(site.href, PAGE_LIMIT, "text/html");
  const html = text(page);
  const found = [...parseJsonLd(html, site.href), ...parseMeta(html, site.href)];

  const map = await fetchLimited(`${origin}/sitemap.xml`, PAGE_LIMIT, "application/xml,text/xml");
  let locs = sitemapLocs(text(map));
  if (locs.index) {
    // an index of sitemaps: read the first one or two that look like products, else the first
    const subs = locs.locs
      .filter((l) => /product/i.test(l))
      .concat(locs.locs)
      .slice(0, 2);
    const parts = await pool(subs, 2, async (s) =>
      sitemapLocs(text(await fetchLimited(s, PAGE_LIMIT, "application/xml"))),
    );
    locs = { locs: parts.flatMap((p) => p.locs), index: false };
  }
  const links = productLinks(locs.locs, site.hostname, 30).filter((l) => l !== page?.url);
  const pages = await pool(links, 5, async (l) => {
    const r = await fetchLimited(l, PAGE_LIMIT, "text/html", 6000);
    const h = text(r);
    const items = parseJsonLd(h, l);
    return items.length ? items : parseMeta(h, l);
  });
  const products = dedupe([...found, ...pages.flat()]).slice(0, MAX_PRODUCTS);
  return { source: products.length ? "website" : "none", products };
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    try {
      const body = await req.json().catch(() => ({}));
      const auth = await authorizeClient(req, body.clientId);
      if (auth instanceof Response) return auth;
      const clientId = body.clientId as string;

      const site = typeof body.url === "string" ? safeUrl(body.url) : null;
      if (!site) return json({ error: "Enter your website address, for example myshop.com", code: "bad_url" }, 400);

      let result: Awaited<ReturnType<typeof readProducts>>;
      try {
        result = await readProducts(site);
      } catch (e) {
        if (e instanceof Blocked) return json({ error: "That address can't be imported", code: "bad_url" }, 400);
        throw e;
      }
      if (!result.products.length)
        return json({ error: "No products were found on that website", code: "none_found" }, 404);

      // Everything below runs as the person, so the catalog's own access rules decide whether they may add products.
      const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: req.headers.get("Authorization")! } },
      });
      const { data: existing, error: readError } = await asUser
        .from("products")
        .select("name")
        .eq("client_id", clientId);
      if (readError) return json({ error: "Could not read your catalog" }, 500);
      const have = new Set((existing ?? []).map((p: { name: string }) => p.name.trim().toLowerCase()));
      const fresh = result.products.filter((p) => !have.has(p.name.toLowerCase()));

      const started = Date.now();
      const rows = await pool(fresh, 5, async (p) => {
        const images: string[] = [];
        for (const src of p.images.slice(0, IMAGES_PER_PRODUCT)) {
          let kept = src; // the website's own address if copying is not possible
          if (Date.now() - started < COPY_BUDGET_MS) {
            try {
              const img = await fetchLimited(src, IMAGE_LIMIT, "image/*", 8000);
              const ext = EXT[img?.type.split(";")[0].trim().toLowerCase() ?? ""];
              if (img && ext) {
                const path = `${clientId}/${crypto.randomUUID()}.${ext}`;
                const up = await asUser.storage.from("catalog").upload(path, img.body, { contentType: img.type });
                if (!up.error) kept = asUser.storage.from("catalog").getPublicUrl(path).data.publicUrl;
              }
            } catch {
              // keep the website's address
            }
          }
          images.push(kept);
        }
        return {
          client_id: clientId,
          name: p.name,
          description: p.description,
          price: p.price,
          currency: p.currency ?? "USD",
          in_stock: p.inStock,
          images,
          videos: [] as string[],
        };
      });

      let imported = 0;
      for (let i = 0; i < rows.length; i += 25) {
        const { error } = await asUser.from("products").insert(rows.slice(i, i + 25));
        if (error) {
          if (error.message.includes("WOB_LIMIT:"))
            return json(
              { error: error.message.split("WOB_LIMIT:")[1].trim() || "Plan limit reached", code: "limit", imported },
              409,
            );
          console.error("catalog-import insert failed", error.message);
          return json({ error: "Could not save the products", imported }, imported ? 207 : 403);
        }
        imported += Math.min(25, rows.length - i);
      }
      return json({
        success: true,
        source: result.source,
        found: result.products.length,
        imported,
        skipped: result.products.length - fresh.length,
      });
    } catch (e) {
      console.error("catalog-import error", e);
      return json({ error: "Could not import products. Please try again." }, 500);
    }
  }),
);
