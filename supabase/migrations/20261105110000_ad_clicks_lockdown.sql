-- ad_clicks is written only by record_ad_click (SECURITY DEFINER) and read by the service role.
REVOKE ALL ON public.ad_clicks FROM anon, authenticated;
