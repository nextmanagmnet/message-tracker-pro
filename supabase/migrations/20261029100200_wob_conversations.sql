-- WOB: conversation history (both sides of the chat), the conversion log
-- sent to TikTok/Meta, AI agent settings, and in-app notifications.

-- ---------------------------------------------------------------------------
-- 1. Conversations (one per lead)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  whatsapp_number_id UUID REFERENCES public.whatsapp_numbers(id) ON DELETE SET NULL,
  lead_id UUID UNIQUE REFERENCES public.leads(id) ON DELETE CASCADE,
  last_inbound_at TIMESTAMPTZ,
  last_outbound_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  analyzed_at TIMESTAMPTZ,
  agent_status TEXT NOT NULL DEFAULT 'off'
    CHECK (agent_status IN ('off', 'ai_active', 'handed_off', 'opted_out')),
  follow_up_count INTEGER NOT NULL DEFAULT 0,
  last_follow_up_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversations_client_last_msg_idx
  ON public.conversations (client_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS conversations_whatsapp_number_idx
  ON public.conversations (whatsapp_number_id);
-- Cron pickup: conversations with messages newer than the last analysis.
CREATE INDEX IF NOT EXISTS conversations_needs_analysis_idx
  ON public.conversations (last_message_at)
  WHERE analyzed_at IS NULL OR analyzed_at < last_message_at;

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view conversations for their clients" ON public.conversations;
CREATE POLICY "Users can view conversations for their clients"
ON public.conversations FOR SELECT TO authenticated
USING (public.user_can_access_client((SELECT auth.uid()), client_id));

-- Take over / hand back to AI from the UI.
DROP POLICY IF EXISTS "Admins can update conversations" ON public.conversations;
CREATE POLICY "Admins can update conversations"
ON public.conversations FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = conversations.client_id
      AND (public.has_agency_role((SELECT auth.uid()), c.agency_id, 'owner')
        OR public.has_agency_role((SELECT auth.uid()), c.agency_id, 'admin'))
  )
);

REVOKE ALL ON public.conversations FROM anon, authenticated;
GRANT SELECT ON public.conversations TO authenticated;
GRANT UPDATE (agent_status) ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  author TEXT NOT NULL CHECK (author IN ('lead', 'owner', 'ai')),
  text TEXT,
  external_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
  ON public.messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS messages_client_idx ON public.messages (client_id);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view messages for their clients" ON public.messages;
CREATE POLICY "Users can view messages for their clients"
ON public.messages FOR SELECT TO authenticated
USING (public.user_can_access_client((SELECT auth.uid()), client_id));

REVOKE ALL ON public.messages FROM anon, authenticated;
GRANT SELECT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Raw WhatsApp ids: needed server-side to reply, never readable by clients.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversation_contacts (
  conversation_id UUID PRIMARY KEY REFERENCES public.conversations(id) ON DELETE CASCADE,
  contact_jid TEXT NOT NULL
);

ALTER TABLE public.conversation_contacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conversation_contacts FROM anon, authenticated;
GRANT ALL ON public.conversation_contacts TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Conversion log: every event sent (or attempted) to TikTok/Meta.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'meta')),
  event_name TEXT NOT NULL,
  stage public.lead_stage NOT NULL,
  value NUMERIC,
  currency TEXT,
  event_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  response JSONB,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversion_events_lead_idx ON public.conversion_events (lead_id);
CREATE INDEX IF NOT EXISTS conversion_events_client_created_idx
  ON public.conversion_events (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS conversion_events_retry_idx
  ON public.conversion_events (created_at)
  WHERE status IN ('pending', 'failed');

ALTER TABLE public.conversion_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view conversion events for their clients" ON public.conversion_events;
CREATE POLICY "Users can view conversion events for their clients"
ON public.conversion_events FOR SELECT TO authenticated
USING (public.user_can_access_client((SELECT auth.uid()), client_id));

REVOKE ALL ON public.conversion_events FROM anon, authenticated;
GRANT SELECT ON public.conversion_events TO authenticated;
GRANT ALL ON public.conversion_events TO service_role;

-- ---------------------------------------------------------------------------
-- 5. AI agent settings (add-on, off by default)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_agent_settings (
  client_id UUID PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  business_knowledge TEXT,
  tone TEXT,
  qualifying_questions TEXT,
  handoff_rules TEXT,
  follow_up_enabled BOOLEAN NOT NULL DEFAULT false,
  follow_up_delay_hours INTEGER NOT NULL DEFAULT 24 CHECK (follow_up_delay_hours >= 1),
  follow_up_max INTEGER NOT NULL DEFAULT 2 CHECK (follow_up_max BETWEEN 0 AND 5),
  allowed_hours_start INTEGER NOT NULL DEFAULT 9 CHECK (allowed_hours_start BETWEEN 0 AND 23),
  allowed_hours_end INTEGER NOT NULL DEFAULT 21 CHECK (allowed_hours_end BETWEEN 1 AND 24),
  timezone TEXT NOT NULL DEFAULT 'Asia/Riyadh',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_agent_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view AI settings for their clients" ON public.ai_agent_settings;
CREATE POLICY "Users can view AI settings for their clients"
ON public.ai_agent_settings FOR SELECT TO authenticated
USING (public.user_can_access_client((SELECT auth.uid()), client_id));

DROP POLICY IF EXISTS "Admins can insert AI settings" ON public.ai_agent_settings;
CREATE POLICY "Admins can insert AI settings"
ON public.ai_agent_settings FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = ai_agent_settings.client_id
      AND (public.has_agency_role((SELECT auth.uid()), c.agency_id, 'owner')
        OR public.has_agency_role((SELECT auth.uid()), c.agency_id, 'admin'))
  )
);

DROP POLICY IF EXISTS "Admins can update AI settings" ON public.ai_agent_settings;
CREATE POLICY "Admins can update AI settings"
ON public.ai_agent_settings FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = ai_agent_settings.client_id
      AND (public.has_agency_role((SELECT auth.uid()), c.agency_id, 'owner')
        OR public.has_agency_role((SELECT auth.uid()), c.agency_id, 'admin'))
  )
);

REVOKE ALL ON public.ai_agent_settings FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.ai_agent_settings TO authenticated;
GRANT ALL ON public.ai_agent_settings TO service_role;

DROP TRIGGER IF EXISTS update_ai_agent_settings_updated_at ON public.ai_agent_settings;
CREATE TRIGGER update_ai_agent_settings_updated_at
BEFORE UPDATE ON public.ai_agent_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 6. In-app notifications (handoff alerts, limits, connection problems)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_agency_created_idx
  ON public.notifications (agency_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_client_idx ON public.notifications (client_id);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view agency notifications" ON public.notifications;
CREATE POLICY "Members can view agency notifications"
ON public.notifications FOR SELECT TO authenticated
USING (public.user_in_agency((SELECT auth.uid()), agency_id));

DROP POLICY IF EXISTS "Members can mark notifications read" ON public.notifications;
CREATE POLICY "Members can mark notifications read"
ON public.notifications FOR UPDATE TO authenticated
USING (public.user_in_agency((SELECT auth.uid()), agency_id))
WITH CHECK (public.user_in_agency((SELECT auth.uid()), agency_id));

REVOKE ALL ON public.notifications FROM anon, authenticated;
GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Realtime
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['leads', 'messages', 'notifications'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
