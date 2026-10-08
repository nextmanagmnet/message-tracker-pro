CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.scheduler_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  cron_token TEXT NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.scheduler_config TO service_role;
ALTER TABLE public.scheduler_config ENABLE ROW LEVEL SECURITY;
INSERT INTO public.scheduler_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id UUID PRIMARY KEY,
  new_verified BOOLEAN NOT NULL DEFAULT true,
  daily_summary BOOLEAN NOT NULL DEFAULT true,
  campaign_alerts BOOLEAN NOT NULL DEFAULT false,
  number_status BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own notification prefs" ON public.notification_preferences
FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.get_agency_members(_agency_id uuid)
RETURNS TABLE(member_id uuid, user_id uuid, role agency_role, email text, full_name text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT am.id, am.user_id, am.role, p.email, p.full_name, am.created_at
  FROM public.agency_members am
  LEFT JOIN public.profiles p ON p.id = am.user_id
  WHERE am.agency_id = _agency_id
    AND public.user_in_agency(auth.uid(), _agency_id)
  ORDER BY am.created_at
$$;
GRANT EXECUTE ON FUNCTION public.get_agency_members(uuid) TO authenticated;