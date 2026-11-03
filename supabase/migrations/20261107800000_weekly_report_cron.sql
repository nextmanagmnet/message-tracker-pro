-- Weekly owner report: the function runs hourly and sends to each client whose
-- chosen local weekday/hour has come (it checks the time zone itself).
-- The cron secret is looked up at execution time; cron.schedule() upserts by name.

SELECT cron.schedule(
  'weekly-report-hourly',
  '5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oiidzysiucznvzgwrtfp.supabase.co/functions/v1/weekly-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT cron_token FROM public.scheduler_config WHERE id = 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
