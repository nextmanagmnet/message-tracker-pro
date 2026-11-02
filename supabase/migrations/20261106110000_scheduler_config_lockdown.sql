-- scheduler_config holds the token that authorizes the scheduled jobs. Row-level security already blocks
-- browser roles (no policies), but Supabase's default privileges still granted them table rights.
-- Only the service role and the database owner read it, so take the rights away as a second layer.
REVOKE ALL ON public.scheduler_config FROM anon, authenticated;
