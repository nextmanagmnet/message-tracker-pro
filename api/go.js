// /go — WhatsApp bridge for TikTok website ads, rendered on the server so the client's pixel id sits
// literally in TikTok's standard base code. TikTok's "detect base code on your page" check reads the HTML;
// it can't see a pixel loaded from a URL parameter by script (public/go.html, kept for older ad links).
// /go?to=<digits>&text=<message>&px=<pixel code>&cid=__CAMPAIGN_ID__ (TikTok appends &ttclid=...)
const PIXEL = /^[A-Z0-9]{10,30}$/;
// Page checkers (TikTok's scanner, link previews) stay on the page instead of leaving for WhatsApp.
// Not "tiktok"/"bytedance": real ad clicks open in TikTok's in-app browser.
const CHECKER = /bot|crawl|spider|headless|lighthouse|preview/i;

const baseCode = (px) => `<script>
!function (w, d, t) {
  w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
  ttq.load('${px}');
  ttq.page();
}(window, document, 'ttq');
</script>`;

// Same logic as public/go.html: click id + campaign id go into the WhatsApp message for WOB's webhook.
const redirect = (delayMs) => `<script>
function whatsappUrl(search) {
  var q = new URLSearchParams(search);
  var to = (q.get("to") || "").replace(/\\D/g, "");
  if (to.length < 8) return null;
  var real = function (v) { return v && !/^__\\w+__$/.test(v); };
  var parts = [q.get("text") || ""];
  if (real(q.get("ttclid"))) parts.push("ttclid=" + q.get("ttclid"));
  if (real(q.get("cid"))) parts.push("cid=" + q.get("cid"));
  return "https://wa.me/" + to + "?text=" + encodeURIComponent(parts.join(" ").trim());
}
var url = whatsappUrl(location.search);
if (url) {
  document.getElementById("wa").href = url;
  ${delayMs === null ? "" : `setTimeout(function () { location.replace(url); }, ${delayMs});`}
}
</script>`;

export default function handler(req, res) {
  const px = typeof req.query.px === "string" && PIXEL.test(req.query.px) ? req.query.px : null;
  const checker = CHECKER.test(req.headers["user-agent"] || "");
  // ponytail: fixed wait for the pixel's PageView before leaving; ~1s is the cost of a tracked click.
  const delay = checker ? null : px ? 900 : 0;
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
${redirect(delay)}
</body>
</html>`);
}
