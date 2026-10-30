-- WOB background jobs, same pattern as 20261012120000_schedule_background_jobs.sql:
-- cron.schedule() upserts by job name, and the cron secret is read from
-- scheduler_config at execution time so it never appears in the job text.

-- Classify chats into real / qualified / client and report to ad platforms.
SELECT cron.schedule(
  'analyze-conversations',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oiidzysiucznvzgwrtfp.supabase.co/functions/v1/analyze-conversation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT cron_token FROM public.scheduler_config WHERE id = 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- AI follow-ups (add-on; the function no-ops for clients with it disabled).
SELECT cron.schedule(
  'ai-followups',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oiidzysiucznvzgwrtfp.supabase.co/functions/v1/ai-followups',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT cron_token FROM public.scheduler_config WHERE id = 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Retry conversion events that failed or are still pending.
SELECT cron.schedule(
  'retry-conversions',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oiidzysiucznvzgwrtfp.supabase.co/functions/v1/conversion-retry',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT cron_token FROM public.scheduler_config WHERE id = 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
