-- WOB foundation: remove the legacy tenant model, tighten lead inserts,
-- add Individual vs Agency accounts with DB-enforced limits, and hide OAuth
-- tokens from the browser with column-level grants.

-- ---------------------------------------------------------------------------
-- 1. Legacy tenant model
-- ---------------------------------------------------------------------------
-- profiles is the only live table still pointing at tenants.
DROP POLICY IF EXISTS "Users can view profiles in their tenant" ON public.profiles;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_tenant_id_fkey;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS tenant_id;

CREATE POLICY "Users can view own and agency-mate profiles"
ON public.profiles FOR SELECT TO authenticated
USING (
  id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.agency_members me
    JOIN public.agency_members them ON them.agency_id = me.agency_id
    WHERE me.user_id = (SELECT auth.uid())
      AND them.user_id = profiles.id
  )
);

-- Old tenant-based policies on live tables were replaced in 20251222135857;
-- drop any stragglers by name before dropping the functions they use.
DROP POLICY IF EXISTS "Users can view TikTok accounts in their tenant" ON public.tiktok_accounts;
DROP POLICY IF EXISTS "Admins can manage TikTok accounts in their tenant" ON public.tiktok_accounts;
DROP POLICY IF EXISTS "Users can view WhatsApp numbers in their tenant" ON public.whatsapp_numbers;
DROP POLICY IF EXISTS "Admins can manage WhatsApp numbers in their tenant" ON public.whatsapp_numbers;
DROP POLICY IF EXISTS "Users can view campaigns in their tenant" ON public.tiktok_campaigns;
DROP POLICY IF EXISTS "Admins can manage campaigns in their tenant" ON public.tiktok_campaigns;
DROP POLICY IF EXISTS "Users can view leads in their tenant" ON public.leads;
DROP POLICY IF EXISTS "Admins can update leads in their tenant" ON public.leads;

DROP TABLE IF EXISTS public.user_roles;
DROP TABLE IF EXISTS public.tenants;

DROP FUNCTION IF EXISTS public.has_role(uuid, uuid, public.app_role);
DROP FUNCTION IF EXISTS public.get_user_tenant_id(uuid);
DROP FUNCTION IF EXISTS public.user_belongs_to_tenant(uuid, uuid);

DROP TYPE IF EXISTS public.app_role;
DROP TYPE IF EXISTS public.subscription_plan;

-- ---------------------------------------------------------------------------
-- 2. Leads are written by edge functions (service role bypasses RLS) only.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "System can insert leads" ON public.leads;

-- ---------------------------------------------------------------------------
-- 3. Account type
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_type' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.account_type AS ENUM ('individual', 'agency');
  END IF;
END $$;

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS account_type public.account_type NOT NULL DEFAULT 'agency';

-- ---------------------------------------------------------------------------
-- 4. Individual-account limits (enforced in the DB, not just the UI).
--    Errors start with 'WOB_LIMIT:' so the frontend can show a friendly message.
--    Upserts fire BEFORE INSERT too, so rows with the same natural key
--    (reconnecting the same account) are excluded from the count.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wob_enforce_individual_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _agency_id uuid;
  _type public.account_type;
  _count int;
BEGIN
  IF TG_TABLE_NAME IN ('clients', 'agency_members') THEN
    _agency_id := NEW.agency_id;
  ELSE
    SELECT c.agency_id INTO _agency_id FROM public.clients c WHERE c.id = NEW.client_id;
  END IF;

  IF _agency_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT a.account_type INTO _type FROM public.agencies a WHERE a.id = _agency_id;
  IF _type IS DISTINCT FROM 'individual' THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'clients' THEN
    SELECT count(*) INTO _count FROM public.clients
    WHERE agency_id = _agency_id AND id <> NEW.id;
    IF _count >= 1 THEN
      RAISE EXCEPTION 'WOB_LIMIT: client' USING HINT = 'Individual accounts can have only one business.';
    END IF;

  ELSIF TG_TABLE_NAME = 'agency_members' THEN
    SELECT count(*) INTO _count FROM public.agency_members
    WHERE agency_id = _agency_id AND id <> NEW.id;
    IF _count >= 1 THEN
      RAISE EXCEPTION 'WOB_LIMIT: member' USING HINT = 'Individual accounts cannot invite team members.';
    END IF;

  ELSIF TG_TABLE_NAME = 'whatsapp_numbers' THEN
    IF NEW.status = 'disconnected' THEN
      RETURN NEW;
    END IF;
    SELECT count(*) INTO _count
    FROM public.whatsapp_numbers w
    JOIN public.clients c ON c.id = w.client_id
    WHERE c.agency_id = _agency_id
      AND w.id <> NEW.id
      AND w.phone_number_id <> NEW.phone_number_id
      AND w.status <> 'disconnected';
    IF _count >= 1 THEN
      RAISE EXCEPTION 'WOB_LIMIT: whatsapp' USING HINT = 'Individual accounts can connect only one WhatsApp number.';
    END IF;

  ELSIF TG_TABLE_NAME = 'tiktok_accounts' THEN
    SELECT count(*) INTO _count
    FROM public.tiktok_accounts t
    JOIN public.clients c ON c.id = t.client_id
    WHERE c.agency_id = _agency_id
      AND t.id <> NEW.id
      AND t.advertiser_id <> NEW.advertiser_id;
    IF _count >= 1 THEN
      RAISE EXCEPTION 'WOB_LIMIT: tiktok' USING HINT = 'Individual accounts can connect only one TikTok ad account.';
    END IF;

  ELSIF TG_TABLE_NAME = 'meta_accounts' THEN
    SELECT count(*) INTO _count
    FROM public.meta_accounts m
    JOIN public.clients c ON c.id = m.client_id
    WHERE c.agency_id = _agency_id
      AND m.id <> NEW.id
      AND m.ad_account_id <> NEW.ad_account_id;
    IF _count >= 1 THEN
      RAISE EXCEPTION 'WOB_LIMIT: meta' USING HINT = 'Individual accounts can connect only one Meta ad account.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wob_limits_clients ON public.clients;
CREATE TRIGGER wob_limits_clients
BEFORE INSERT OR UPDATE OF agency_id ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.wob_enforce_individual_limits();

DROP TRIGGER IF EXISTS wob_limits_agency_members ON public.agency_members;
CREATE TRIGGER wob_limits_agency_members
BEFORE INSERT OR UPDATE OF agency_id ON public.agency_members
FOR EACH ROW EXECUTE FUNCTION public.wob_enforce_individual_limits();

DROP TRIGGER IF EXISTS wob_limits_whatsapp_numbers ON public.whatsapp_numbers;
CREATE TRIGGER wob_limits_whatsapp_numbers
BEFORE INSERT OR UPDATE OF status, client_id ON public.whatsapp_numbers
FOR EACH ROW EXECUTE FUNCTION public.wob_enforce_individual_limits();

DROP TRIGGER IF EXISTS wob_limits_tiktok_accounts ON public.tiktok_accounts;
CREATE TRIGGER wob_limits_tiktok_accounts
BEFORE INSERT OR UPDATE OF client_id ON public.tiktok_accounts
FOR EACH ROW EXECUTE FUNCTION public.wob_enforce_individual_limits();
-- meta_accounts trigger is attached in 20261029100100_wob_meta_and_funnel.sql

-- ---------------------------------------------------------------------------
-- 5. Signup: Individual or Agency
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_agency_id UUID;
  _type public.account_type;
  _company TEXT := NULLIF(trim(new.raw_user_meta_data ->> 'company_name'), '');
  _full_name TEXT := COALESCE(new.raw_user_meta_data ->> 'full_name', '');
BEGIN
  _type := CASE new.raw_user_meta_data ->> 'account_type'
             WHEN 'individual' THEN 'individual'::public.account_type
             ELSE 'agency'::public.account_type
           END;

  INSERT INTO public.agencies (name, account_type)
  VALUES (COALESCE(_company, NULLIF(_full_name, ''), 'My Agency'), _type)
  RETURNING id INTO new_agency_id;

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, _full_name);

  INSERT INTO public.agency_members (user_id, agency_id, role)
  VALUES (new.id, new_agency_id, 'owner');

  -- Individuals get their single business created up front.
  IF _type = 'individual' THEN
    INSERT INTO public.clients (agency_id, name)
    VALUES (new_agency_id, COALESCE(_company, NULLIF(_full_name, ''), 'My Business'));
  END IF;

  RETURN new;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Never expose OAuth tokens to the browser. RLS is row-level, so any
--    member who can see the row could read the token; column grants fix that.
-- ---------------------------------------------------------------------------
REVOKE SELECT ON public.tiktok_accounts FROM anon, authenticated;
GRANT SELECT (id, tenant_id, client_id, advertiser_id, advertiser_name,
              token_expires_at, connected_at, updated_at)
  ON public.tiktok_accounts TO authenticated;
