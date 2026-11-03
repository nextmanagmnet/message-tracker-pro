// WOB's /go bridge for TikTok website ads (served by api/go.js). TikTok rejects wa.me once a pixel is on, so
// ads land on this real page; TikTok appends ttclid and fills __CAMPAIGN_ID__, and go.js renders the pixel base
// code and folds both ids into the WhatsApp message for the webhook. The server builds the same link in
// supabase/functions/_shared/tiktokAds.ts goLink().
export function goLink(origin: string, phone: string, text: string, pixelCode?: string | null): string {
  const to = phone.replace(/\D/g, "");
  if (!to) return "";
  const q = new URLSearchParams({ to, text, ...(pixelCode ? { px: pixelCode } : {}) });
  return `${origin.replace(/\/$/, "")}/go?${q}&cid=__CAMPAIGN_ID__`;
}
