-- Groundwork for the roadmap features: delivery-based purchases, AI campaign launcher and media,
-- TikTok audiences, AI campaign recommendations, chatbot tone, weekly owner report, team inbox.
-- Additive only. Browser roles read through RLS; writes go through edge functions (service role),
-- except settings the agency edits directly (weekly report, delivery markers, tone text).

-- ---------- Purchase counted on delivery ----------
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS purchase_trigger text NOT NULL DEFAULT 'confirmation'
    CHECK (purchase_trigger IN ('confirmation', 'delivery')),
  ADD COLUMN IF NOT EXISTS delivery_marker text NOT NULL DEFAULT 'ORDER DELIVERED',
  ADD COLUMN IF NOT EXISTS return_marker text NOT NULL DEFAULT 'ORDER RETURNED';

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS order_status text CHECK (order_status IN ('confirmed', 'delivered', 'returned')),
  ADD COLUMN IF NOT EXISTS order_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS returned_at timestamptz;

-- ---------- Chatbot that learns the owner's tone ----------
ALTER TABLE public.ai_agent_settings
  ADD COLUMN IF NOT EXISTS tone_profile text,
  ADD COLUMN IF NOT EXISTS tone_sample_size integer,
  ADD COLUMN IF NOT EXISTS tone_updated_at timestamptz;

-- ---------- Team inbox ----------
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_reply_at timestamptz;
CREATE INDEX IF NOT EXISTS conversations_assigned_idx ON public.conversations (client_id, assigned_to);

-- First human or AI reply to a chat, for reply-time tracking; set once, from the messages log.
CREATE OR REPLACE FUNCTION public.set_first_reply_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.direction = 'out' THEN
    UPDATE public.conversations SET first_reply_at = NEW.created_at
    WHERE id = NEW.conversation_id AND first_reply_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_first_reply_at() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS set_first_reply_at ON public.messages;
CREATE TRIGGER set_first_reply_at AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.set_first_reply_at();

-- ---------- Weekly report to the business owner on WhatsApp ----------
CREATE TABLE IF NOT EXISTS public.weekly_report_settings (
  client_id uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  phone text CHECK (phone ~ '^\+?[0-9]{8,15}$'),
  language text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'ar')),
  weekday smallint NOT NULL DEFAULT 1 CHECK (weekday BETWEEN 0 AND 6), -- 0 = Sunday
  hour smallint NOT NULL DEFAULT 9 CHECK (hour BETWEEN 0 AND 23),
  timezone text NOT NULL DEFAULT 'Asia/Beirut',
  last_sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- AI campaign launcher ----------
CREATE TABLE IF NOT EXISTS public.ad_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('video', 'image')),
  storage_path text,
  file_name text,
  tiktok_video_id text,
  tiktok_image_id text,
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processing', 'ready', 'failed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ad_media_client_idx ON public.ad_media (client_id);

CREATE TABLE IF NOT EXISTS public.ad_launches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'launching', 'launched', 'failed')),
  params jsonb NOT NULL DEFAULT '{}',
  tiktok_campaign_id text,
  tiktok_adgroup_id text,
  tiktok_ad_ids text[] NOT NULL DEFAULT '{}',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ad_launches_client_idx ON public.ad_launches (client_id, created_at DESC);

-- ---------- Audiences from real buyers ----------
CREATE TABLE IF NOT EXISTS public.tiktok_audiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  source text NOT NULL CHECK (source IN ('buyers', 'qualified')),
  tiktok_audience_id text,
  tiktok_lookalike_id text,
  member_count integer,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'syncing', 'ready', 'failed')),
  error text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tiktok_audiences_client_idx ON public.tiktok_audiences (client_id);

-- ---------- AI campaign recommendations ----------
CREATE TABLE IF NOT EXISTS public.ad_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  platform text NOT NULL DEFAULT 'tiktok' CHECK (platform IN ('tiktok', 'meta')),
  level text NOT NULL CHECK (level IN ('campaign', 'adgroup', 'ad')),
  target_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('pause', 'increase_budget', 'decrease_budget', 'switch_event', 'refresh_creative', 'other')),
  title text NOT NULL,
  rationale text NOT NULL,
  action jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'dismissed', 'failed')),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ad_recommendations_client_idx ON public.ad_recommendations (client_id, status, created_at DESC);

-- ---------- Row-level security ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['weekly_report_settings', 'ad_media', 'ad_launches', 'tiktok_audiences', 'ad_recommendations'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Members view %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Members view %1$s" ON public.%1$I FOR SELECT TO authenticated
      USING (public.user_can_access_client((SELECT auth.uid()), client_id))', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- The weekly report is a plain setting the agency owner/admin edits from the app.
DROP POLICY IF EXISTS "Admins manage weekly report" ON public.weekly_report_settings;
CREATE POLICY "Admins manage weekly report" ON public.weekly_report_settings FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = weekly_report_settings.client_id
  AND (public.has_agency_role((SELECT auth.uid()), c.agency_id, 'owner') OR public.has_agency_role((SELECT auth.uid()), c.agency_id, 'admin'))))
WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = weekly_report_settings.client_id
  AND (public.has_agency_role((SELECT auth.uid()), c.agency_id, 'owner') OR public.has_agency_role((SELECT auth.uid()), c.agency_id, 'admin'))));
GRANT INSERT, UPDATE ON public.weekly_report_settings TO authenticated;

-- ---------- Private storage for ad media (uploaded to TikTok by the server) ----------
INSERT INTO storage.buckets (id, name, public) VALUES ('ad-media', 'ad-media', false) ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "Members upload ad media" ON storage.objects;
CREATE POLICY "Members upload ad media" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ad-media' AND public.user_can_access_client((SELECT auth.uid()), ((storage.foldername(name))[1])::uuid));
DROP POLICY IF EXISTS "Members read ad media" ON storage.objects;
CREATE POLICY "Members read ad media" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'ad-media' AND public.user_can_access_client((SELECT auth.uid()), ((storage.foldername(name))[1])::uuid));
DROP POLICY IF EXISTS "Members delete ad media" ON storage.objects;
CREATE POLICY "Members delete ad media" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'ad-media' AND public.user_can_access_client((SELECT auth.uid()), ((storage.foldername(name))[1])::uuid));
