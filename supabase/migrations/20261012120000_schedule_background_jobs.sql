-- Register the hourly background jobs via pg_cron + pg_net.
--
-- Previously these were set up by hand (outside version control) — this
-- migration is the first time the actual schedule exists in the repo.
-- cron.schedule() upserts by job name, so re-running this is safe.
--
-- The cron secret is read from scheduler_config at *execution* time via the
-- subquery below, so the actual token value is never stored in the job
-- definition or in this file — only the lookup query is.

SELECT cron.schedule(
  'refresh-tokens-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oiidzysiucznvzgwrtfp.supabase.co/functions/v1/refresh-tokens',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT cron_token FROM public.scheduler_config WHERE id = 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'sync-campaigns-hourly',
  '15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oiidzysiucznvzgwrtfp.supabase.co/functions/v1/sync-campaigns',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT cron_token FROM public.scheduler_config WHERE id = 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
