-- Ad clicks seen by the /go WhatsApp bridge. The bridge stores the TikTok click id + campaign here and
-- puts only this row's id, as invisible characters, into the prefilled WhatsApp message; the webhook
-- reads it back. Customers no longer see "ttclid=... cid=..." in their first message.
CREATE TABLE public.ad_clicks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ttclid text,
  campaign_id text,
  to_number text,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Service role only (webhook); the bridge writes through record_ad_click.
ALTER TABLE public.ad_clicks ENABLE ROW LEVEL SECURITY;

-- Called anonymously by the bridge (public ad traffic), so it only inserts, with sizes capped.
-- ponytail: no rate limit or retention; add a cleanup cron (e.g. drop rows older than 30 days) if it grows.
CREATE FUNCTION public.record_ad_click(p_ttclid text, p_campaign_id text, p_to text)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.ad_clicks (ttclid, campaign_id, to_number)
  VALUES (left(p_ttclid, 500), left(p_campaign_id, 64), left(p_to, 20))
  RETURNING id;
$$;
REVOKE ALL ON FUNCTION public.record_ad_click(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_ad_click(text, text, text) TO anon, authenticated;
