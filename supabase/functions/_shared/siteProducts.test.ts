import { describe, expect, it } from "vitest";
import {
  dedupe,
  parseJsonLd,
  parseMeta,
  parseShopify,
  parseWoo,
  productLinks,
  safeUrl,
  sitemapLocs,
  stripHtml,
} from "./siteProducts";

describe("safeUrl", () => {
  it("accepts ordinary websites, adding https when missing", () => {
    expect(safeUrl("shop.example-store.com")?.href).toBe("https://shop.example-store.com/");
    expect(safeUrl(" http://mystore.com/products ")?.hostname).toBe("mystore.com");
  });

  it("refuses internal names, IP addresses, logins and odd ports", () => {
    for (const bad of [
      "http://localhost/",
      "http://127.0.0.1/",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/",
      "https://printer.local/",
      "https://db.internal/",
      "https://intranet/",
      "https://user:pw@shop.com/",
      "https://shop.com:8443/",
      "ftp://shop.com/",
      "file:///etc/passwd",
      "not a url",
      "",
    ])
      expect(safeUrl(bad), bad).toBeNull();
  });
});

describe("stripHtml", () => {
  it("turns HTML into readable text", () => {
    expect(stripHtml("<p>Soft &amp; warm</p><p>100% cotton<br>Machine wash</p><script>x()</script>")).toBe(
      "Soft & warm\n100% cotton\nMachine wash",
    );
  });
});

describe("parseShopify", () => {
  it("reads title, cheapest price, stock and images", () => {
    const [p] = parseShopify(
      {
        products: [
          {
            title: "Linen Shirt",
            handle: "linen-shirt",
            body_html: "<p>Cool in summer</p>",
            variants: [
              { price: "45.00", available: false },
              { price: "39.50", available: true },
            ],
            images: [{ src: "//cdn.test-shop.com/a.jpg" }, { src: "https://cdn.test-shop.com/b.jpg" }],
          },
        ],
      },
      "https://test-shop.com",
      "usd",
    );
    expect(p).toEqual({
      name: "Linen Shirt",
      description: "Cool in summer",
      price: 39.5,
      currency: "USD",
      inStock: true,
      images: ["https://cdn.test-shop.com/a.jpg", "https://cdn.test-shop.com/b.jpg"],
      url: "https://test-shop.com/products/linen-shirt",
    });
    expect(parseShopify({}, "https://x.com")).toEqual([]);
  });

  it("marks a product out of stock when no variant is available", () => {
    const [p] = parseShopify(
      { products: [{ title: "A", variants: [{ price: "1", available: false }] }] },
      "https://x.com",
    );
    expect(p.inStock).toBe(false);
  });
});

describe("parseWoo", () => {
  it("converts minor-unit prices", () => {
    const [p] = parseWoo(
      [
        {
          name: "Tea &amp; Honey Set",
          short_description: "<p>A gift</p>",
          prices: { price: "1250", currency_code: "usd", currency_minor_unit: 2 },
          is_in_stock: true,
          images: [{ src: "https://wp.test-shop.com/x.png" }],
          permalink: "https://wp.test-shop.com/product/set",
        },
      ],
      "https://wp.test-shop.com",
    );
    expect(p).toMatchObject({ name: "Tea & Honey Set", price: 12.5, currency: "USD", description: "A gift" });
  });
});

describe("parseJsonLd", () => {
  const page = (json: unknown) => `<html><script type="application/ld+json">${JSON.stringify(json)}</script></html>`;

  it("reads a Product with an offer", () => {
    const [p] = parseJsonLd(
      page({
        "@type": "Product",
        name: "Abaya",
        description: "Black abaya",
        image: ["/img/1.jpg", { url: "https://cdn.test-shop.com/2.jpg" }],
        offers: { "@type": "Offer", price: "89.00", priceCurrency: "AED", availability: "https://schema.org/InStock" },
      }),
      "https://test-shop.com/p/abaya",
    );
    expect(p).toMatchObject({
      name: "Abaya",
      price: 89,
      currency: "AED",
      inStock: true,
      images: ["https://test-shop.com/img/1.jpg", "https://cdn.test-shop.com/2.jpg"],
      url: "https://test-shop.com/p/abaya",
    });
  });

  it("finds products inside @graph and item lists, and reads out-of-stock", () => {
    const list = parseJsonLd(
      page({
        "@graph": [
          { "@type": "WebSite", name: "Shop" },
          {
            "@type": "ItemList",
            itemListElement: [
              {
                "@type": "ListItem",
                item: { "@type": "Product", name: "One", offers: { price: 5, availability: "OutOfStock" } },
              },
              { "@type": ["Product", "Thing"], name: "Two", offers: [{ lowPrice: "7" }] },
            ],
          },
        ],
      }),
      "https://test-shop.com",
    );
    expect(list.map((p) => [p.name, p.price, p.inStock])).toEqual([
      ["One", 5, false],
      ["Two", 7, true],
    ]);
  });

  it("ignores broken blocks and pages with no products", () => {
    expect(parseJsonLd('<script type="application/ld+json">{oops</script>', "https://x.com")).toEqual([]);
    expect(parseJsonLd(page({ "@type": "Organization", name: "Shop" }), "https://x.com")).toEqual([]);
  });
});

describe("parseMeta", () => {
  it("needs a price so ordinary pages are not mistaken for products", () => {
    const tags = (extra: string) =>
      `<meta property="og:title" content="Blue Vase"><meta property="og:image" content="/v.jpg">${extra}`;
    expect(parseMeta(tags(""), "https://x.com/p/vase")).toEqual([]);
    const [p] = parseMeta(
      tags(
        '<meta property="product:price:amount" content="24.90"><meta property="product:price:currency" content="EUR">',
      ),
      "https://x.com/p/vase",
    );
    expect(p).toMatchObject({ name: "Blue Vase", price: 24.9, currency: "EUR", images: ["https://x.com/v.jpg"] });
  });
});

describe("sitemaps", () => {
  it("lists locations and recognises an index", () => {
    const xml =
      "<urlset><url><loc>https://a.com/products/x</loc></url><url><loc><![CDATA[https://a.com/about]]></loc></url></urlset>";
    expect(sitemapLocs(xml)).toEqual({ locs: ["https://a.com/products/x", "https://a.com/about"], index: false });
    expect(sitemapLocs("<sitemapindex><sitemap><loc>https://a.com/s1.xml</loc></sitemap></sitemapindex>").index).toBe(
      true,
    );
  });

  it("keeps product-looking pages of the same site only, up to the limit", () => {
    const locs = [
      "https://www.a.com/products/shirt",
      "https://a.com/about",
      "https://evil.com/products/x",
      "https://a.com/shop/hat",
      "https://a.com/products/photo.jpg",
      "https://a.com/product/bag",
    ];
    expect(productLinks(locs, "a.com", 2)).toEqual(["https://www.a.com/products/shirt", "https://a.com/shop/hat"]);
  });
});

describe("dedupe", () => {
  it("counts the same product once", () => {
    const base = { description: null, price: 1, currency: null, inStock: true, images: [], url: null };
    expect(
      dedupe([
        { ...base, name: "Shirt" },
        { ...base, name: "shirt" },
        { ...base, name: "Hat" },
      ]),
    ).toHaveLength(2);
  });
});
