-- Spend/clicks closer to TikTok Ads Manager: sync every 15 minutes instead of hourly.
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'sync-campaigns-hourly'), schedule := '*/15 * * * *');
