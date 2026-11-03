-- Weekly re-upload of every TikTok audience built from buyers / qualified leads, so they keep growing.
-- The cron secret is looked up at execution time; cron.schedule() upserts by name.

SELECT cron.schedule(
  'tiktok-audiences-weekly',
  '30 3 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://oiidzysiucznvzgwrtfp.supabase.co/functions/v1/tiktok-audiences',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT cron_token FROM public.scheduler_config WHERE id = 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
