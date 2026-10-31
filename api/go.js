// /go — WhatsApp bridge for TikTok website ads, rendered on the server so the client's pixel id sits
// literally in TikTok's standard base code (TikTok's "detect base code on your page" check reads the HTML).
// The TikTok click id + campaign are stored in ad_clicks and only the row id rides in the WhatsApp
// message, as invisible characters, so customers see just the prefilled text.
// /go?to=<digits>&text=<message>&px=<pixel code>&cid=__CAMPAIGN_ID__ (TikTok appends &ttclid=...)
const PIXEL = /^[A-Z0-9]{10,30}$/;
// Page checkers (TikTok's scanner, link previews) stay on the page instead of leaving for WhatsApp.
// Not "tiktok"/"bytedance": real ad clicks open in TikTok's in-app browser.
const CHECKER = /bot|crawl|spider|headless|lighthouse|preview/i;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const str = (v) => (typeof v === "string" ? v : "");
const real = (v) => v && !/^__\w+__$/.test(v);

// Keep in sync with encodeRef/decodeRef in supabase/functions/_shared/funnel.ts.
const encodeRef = (id) => "‍" + Number(id).toString(2).replace(/0/g, "​").replace(/1/g, "‌") + "‍";

async function recordClick(ttclid, cid, to) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/record_ad_click`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_ttclid: ttclid || null, p_campaign_id: cid || null, p_to: to }),
      signal: AbortSignal.timeout(3000),
    });
    const id = r.ok ? await r.json() : null;
    return Number.isSafeInteger(id) ? id : null;
  } catch {
    return null;
  }
}

async function whatsappUrl(q, record) {
  const to = str(q.to).replace(/\D/g, "");
  if (to.length < 8) return null;
  const ttclid = real(str(q.ttclid)) ? str(q.ttclid) : "";
  const cid = real(str(q.cid)) ? str(q.cid) : "";
  let text = str(q.text).slice(0, 500);
  if (ttclid || cid) {
    const id = record ? await recordClick(ttclid, cid, to) : null;
    // If the click couldn't be stored, fall back to the visible codes so the chat is still attributed.
    text = id ? text + encodeRef(id) : [text, ttclid && `ttclid=${ttclid}`, cid && `cid=${cid}`].filter(Boolean).join(" ");
  }
  return `https://wa.me/${to}?text=${encodeURIComponent(text.trim())}`;
}

const baseCode = (px) => `<script>
!function (w, d, t) {
  w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
  ttq.load('${px}');
  ttq.page();
}(window, document, 'ttq');
</script>`;

export default async function handler(req, res) {
  const px = PIXEL.test(str(req.query.px)) ? req.query.px : null;
  const checker = CHECKER.test(req.headers["user-agent"] || "");
  const url = await whatsappUrl(req.query, !checker);
  // ponytail: fixed wait for the pixel's PageView before leaving; ~1s is the cost of a tracked click.
  const delay = px ? 900 : 0;
  // JSON + escaped "<" keeps the URL inert inside the script tag.
  const urlJs = JSON.stringify(url).replace(/</g, "\\u003c");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>WhatsApp</title>
${px ? baseCode(px) : ""}
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#111}a{background:#25D366;color:#fff;padding:14px 28px;border-radius:10px;font-weight:600;text-decoration:none}</style>
</head>
<body>
<a id="wa" href="#">WhatsApp</a>
<script>
var url = ${urlJs};
if (url) {
  document.getElementById("wa").href = url;
  ${checker ? "" : `setTimeout(function () { location.replace(url); }, ${delay});`}
} else document.body.textContent = "Invalid link";
</script>
</body>
</html>`);
}
