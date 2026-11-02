-- ad_clicks only needs to live until the customer's first WhatsApp message arrives;
-- purge rows older than 30 days daily at 03:30 UTC. cron.schedule() upserts by job name,
-- so re-running this is safe.
SELECT cron.schedule(
  'ad-clicks-retention',
  '30 3 * * *',
  $$DELETE FROM public.ad_clicks WHERE created_at < now() - interval '30 days'$$
);
