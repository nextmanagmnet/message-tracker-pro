-- Weekly campaign recommendations: every Monday 06:00 UTC, ad-optimizer analyzes every client with TikTok
-- connected. It only writes suggestions; nothing changes on TikTok until an owner/admin applies one.
-- The cron token is read at execution time, as in 20261012120000_schedule_background_jobs.sql.

SELECT cron.schedule(
  'ad-optimizer-weekly',
  '0 6 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://oiidzysiucznvzgwrtfp.supabase.co/functions/v1/ad-optimizer',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT cron_token FROM public.scheduler_config WHERE id = 1)
    ),
    body := '{"action":"analyze"}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);
