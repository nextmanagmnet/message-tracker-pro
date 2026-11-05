// Reads a business's products from its own website. Three sources, tried in this order by catalog-import:
//   1. Shopify  (/products.json)        2. WooCommerce (/wp-json/wc/store/v1/products)
//   3. any other site: schema.org Product data (JSON-LD) or Open Graph product tags on the page / its product pages.
// Pure (no Deno or network APIs) so Vitest covers it; the fetching lives in catalog-import/index.ts.

export interface SiteProduct {
  name: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  inStock: boolean;
  images: string[];
  url: string | null;
}

export const MAX_PRODUCTS = 60;
const MAX_IMAGES = 4;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const asArray = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

/**
 * The address a person typed, if it is safe for a server to fetch: web pages only, a public-looking host name, no
 * login in the address, normal ports. Blocks internal names and raw IP addresses so the function cannot be pointed
 * at private services. (Each redirect is checked again by the caller.)
 */
export function safeUrl(input: string): URL | null {
  let text = input.trim();
  if (!text) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`;
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== "80" && u.port !== "443") return null;
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") || host.endsWith(".")) return null;
  if (/^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[")) return null; // IP addresses
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp|test|invalid|example)$/.test(host)) return null;
  return u;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

/** Plain text from a product's HTML description. */
export function stripHtml(html: string, max = 600): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#?\w+);/g, (m, e: string) => ENTITIES[e] ?? m)
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim()
    .slice(0, max);
}

function absolute(href: string, base: string): string | null {
  try {
    const u = new URL(href, base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

const money = (v: unknown): number | null => {
  if (typeof v !== "number" && str(v) === "") return null; // Number("") is 0, which would read as a free product
  const n = typeof v === "number" ? v : Number(str(v).replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

const finish = (p: Partial<SiteProduct> & { name: string }, base: string): SiteProduct | null => {
  const name = p.name.slice(0, 200).trim();
  if (!name) return null;
  const images = [...new Set((p.images ?? []).map((i) => absolute(i, base)).filter((i): i is string => !!i))].slice(
    0,
    MAX_IMAGES,
  );
  return {
    name,
    description: p.description ? p.description : null,
    price: p.price ?? null,
    currency: p.currency && /^[A-Za-z]{3}$/.test(p.currency) ? p.currency.toUpperCase() : null,
    inStock: p.inStock ?? true,
    images,
    url: p.url ? absolute(p.url, base) : null,
  };
};

const compact = (list: Array<SiteProduct | null>) => list.filter((p): p is SiteProduct => !!p).slice(0, MAX_PRODUCTS);

/** Shopify /products.json. Prices there are plain decimals; the shop's currency comes separately (meta.json). */
export function parseShopify(data: unknown, origin: string, currency: string | null = null): SiteProduct[] {
  const list = (data as { products?: unknown })?.products;
  if (!Array.isArray(list)) return [];
  return compact(
    list.map((raw) => {
      const p = raw as Record<string, unknown>;
      const variants = asArray(p.variants as Array<Record<string, unknown>>);
      const prices = variants.map((v) => money(v.price)).filter((n): n is number => n !== null && n > 0);
      return finish(
        {
          name: str(p.title),
          description: stripHtml(str(p.body_html)),
          price: prices.length ? Math.min(...prices) : null,
          currency,
          inStock: variants.length === 0 || variants.some((v) => v.available !== false),
          images: asArray(p.images as Array<Record<string, unknown>>).map((i) => str(i.src)),
          url: p.handle ? `/products/${str(p.handle)}` : null,
        },
        origin,
      );
    }),
  );
}

/** WooCommerce Store API. Prices are in minor units ("1250" with 2 decimals = 12.50). */
export function parseWoo(data: unknown, origin: string): SiteProduct[] {
  if (!Array.isArray(data)) return [];
  return compact(
    data.map((raw) => {
      const p = raw as Record<string, unknown>;
      const prices = (p.prices ?? {}) as Record<string, unknown>;
      const minor = Number(prices.currency_minor_unit);
      const cents = money(prices.price);
      return finish(
        {
          name: stripHtml(str(p.name), 200),
          description: stripHtml(str(p.short_description) || str(p.description)),
          price: cents === null ? null : Math.round((cents / 10 ** (Number.isFinite(minor) ? minor : 2)) * 100) / 100,
          currency: str(prices.currency_code),
          inStock: p.is_in_stock !== false,
          images: asArray(p.images as Array<Record<string, unknown>>).map((i) => str(i.src)),
          url: str(p.permalink),
        },
        origin,
      );
    }),
  );
}

function jsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      out.push(JSON.parse(m[1].trim()));
    } catch {
      // a broken block is skipped
    }
  }
  return out;
}

function collectProducts(node: unknown, found: Array<Record<string, unknown>>, depth = 0) {
  if (!node || typeof node !== "object" || depth > 6) return;
  if (Array.isArray(node)) return node.forEach((n) => collectProducts(n, found, depth + 1));
  const o = node as Record<string, unknown>;
  const type = asArray(o["@type"] as string | string[]).map(String);
  if (type.includes("Product")) found.push(o);
  for (const key of ["@graph", "itemListElement", "item", "mainEntity", "hasVariant"])
    collectProducts(o[key], found, depth + 1);
}

function offerOf(offers: unknown) {
  const list = asArray(offers as Record<string, unknown> | Array<Record<string, unknown>>);
  const flat = list.flatMap((o) => (o && typeof o === "object" && o.offers ? asArray(o.offers as never) : [o]));
  const priced = flat.filter((o) => o && money(o.price ?? o.lowPrice) !== null) as Array<Record<string, unknown>>;
  const first = priced[0] ?? (flat[0] as Record<string, unknown> | undefined);
  const stock = flat.map((o) => str(o?.availability)).filter(Boolean);
  return {
    price: first ? money(first.price ?? first.lowPrice) : null,
    currency: first ? str(first.priceCurrency) : "",
    inStock: stock.length === 0 || stock.some((a) => !/OutOfStock|SoldOut|Discontinued/i.test(a)),
  };
}

/** schema.org Product data embedded in a page (works for most website builders). */
export function parseJsonLd(html: string, pageUrl: string): SiteProduct[] {
  const found: Array<Record<string, unknown>> = [];
  for (const block of jsonLdBlocks(html)) collectProducts(block, found);
  return compact(
    found.map((p) => {
      const offer = offerOf(p.offers);
      const img = asArray(p.image as unknown).map((i) =>
        typeof i === "string" ? i : str((i as Record<string, unknown> | null)?.url),
      );
      return finish(
        {
          name: stripHtml(str(p.name), 200),
          description: stripHtml(str(p.description)),
          price: offer.price,
          currency: offer.currency,
          inStock: offer.inStock,
          images: img,
          url: str(p.url) || pageUrl,
        },
        pageUrl,
      );
    }),
  );
}

const meta = (html: string, prop: string) => {
  const tag = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, "i"))?.[0];
  return tag ? str(tag.match(/content=["']([^"']*)["']/i)?.[1]) : "";
};

/** Open Graph product tags, for product pages with no JSON-LD. Needs a price, so ordinary pages are not mistaken for products. */
export function parseMeta(html: string, pageUrl: string): SiteProduct[] {
  const price = money(meta(html, "product:price:amount") || meta(html, "og:price:amount"));
  const name = meta(html, "og:title");
  if (price === null || !name) return [];
  const p = finish(
    {
      name: stripHtml(name, 200),
      description: stripHtml(meta(html, "og:description")),
      price,
      currency: meta(html, "product:price:currency") || meta(html, "og:price:currency"),
      images: [meta(html, "og:image")].filter(Boolean),
      url: pageUrl,
    },
    pageUrl,
  );
  return p ? [p] : [];
}

/** <loc> entries of a sitemap, and whether it is an index of other sitemaps. */
export function sitemapLocs(xml: string): { locs: string[]; index: boolean } {
  const locs = [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => m[1]);
  return { locs, index: /<sitemapindex/i.test(xml) };
}

const PRODUCT_PATH = /\/(products?|shop|item|items|p|store|catalog|collections\/[^/]+\/products)\/[^/?#]+/i;

/** Page addresses that look like product pages, on the same site, at most `limit`. */
export function productLinks(locs: string[], host: string, limit: number): string[] {
  const out: string[] = [];
  for (const loc of locs) {
    const u = safeUrl(loc);
    if (!u || u.hostname.replace(/^www\./, "") !== host.replace(/^www\./, "")) continue;
    if (PRODUCT_PATH.test(u.pathname) && !/\.(jpe?g|png|webp|gif|pdf)$/i.test(u.pathname)) out.push(u.href);
    if (out.length >= limit) break;
  }
  return out;
}

/** Same product found twice (a page and its sitemap entry) counts once. */
export function dedupe(products: SiteProduct[]): SiteProduct[] {
  const seen = new Set<string>();
  return products.filter((p) => {
    const key = p.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
