-- Client logins: an agency invites a client's own user, tied to exactly one client.
-- Access flows through user_can_access_client(), so changing that one rule scopes every
-- SELECT policy and edge function that already uses it.

ALTER TABLE public.agency_members ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE;
ALTER TABLE public.agency_members DROP CONSTRAINT IF EXISTS agency_members_client_role_chk;
ALTER TABLE public.agency_members ADD CONSTRAINT agency_members_client_role_chk CHECK ((role = 'client') = (client_id IS NOT NULL));

-- Staff (owner/admin/viewer) see every client of their agency; a client user sees only their own.
CREATE OR REPLACE FUNCTION public.user_can_access_client(_user_id UUID, _client_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clients c
    JOIN public.agency_members am ON am.agency_id = c.agency_id
    WHERE c.id = _client_id AND am.user_id = _user_id
      AND (am.role <> 'client' OR am.client_id = _client_id)
  )
$$;

-- "Is a staff member of this agency": client users are deliberately not staff.
CREATE OR REPLACE FUNCTION public.user_in_agency(_user_id UUID, _agency_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agency_members
    WHERE user_id = _user_id AND agency_id = _agency_id AND role <> 'client'
  )
$$;

CREATE OR REPLACE FUNCTION public.is_client_user_of(_user_id UUID, _client_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agency_members
    WHERE user_id = _user_id AND role = 'client' AND client_id = _client_id
  )
$$;
REVOKE EXECUTE ON FUNCTION public.is_client_user_of(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_client_user_of(uuid, uuid) TO authenticated, service_role;

-- The team list is for staff; client users are listed on the Clients page instead.
CREATE OR REPLACE FUNCTION public.get_agency_members(_agency_id UUID)
RETURNS TABLE(member_id UUID, user_id UUID, role agency_role, email TEXT, full_name TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT am.id, am.user_id, am.role, p.email, p.full_name, am.created_at
  FROM public.agency_members am
  LEFT JOIN public.profiles p ON p.id = am.user_id
  WHERE am.agency_id = _agency_id AND am.role <> 'client'
    AND public.user_in_agency(auth.uid(), _agency_id)
  ORDER BY am.created_at
$$;

-- What a client user may read about their surroundings.
DROP POLICY IF EXISTS "Client users view their agency" ON public.agencies;
CREATE POLICY "Client users view their agency" ON public.agencies FOR SELECT TO authenticated
USING (id = public.get_user_agency_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Client users view own client" ON public.clients;
CREATE POLICY "Client users view own client" ON public.clients FOR SELECT TO authenticated
USING (public.is_client_user_of((SELECT auth.uid()), id));

DROP POLICY IF EXISTS "Users view own membership" ON public.agency_members;
CREATE POLICY "Users view own membership" ON public.agency_members FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

-- What a client user may change on their own client: pixel, catalog, ad-account disconnect,
-- and the sales-message phrase (never the name or the agency).
DROP POLICY IF EXISTS "Client users manage own pixels" ON public.tiktok_pixels;
CREATE POLICY "Client users manage own pixels" ON public.tiktok_pixels FOR ALL TO authenticated
USING (public.is_client_user_of((SELECT auth.uid()), client_id))
WITH CHECK (public.is_client_user_of((SELECT auth.uid()), client_id));

DROP POLICY IF EXISTS "Client users manage own products" ON public.products;
CREATE POLICY "Client users manage own products" ON public.products FOR ALL TO authenticated
USING (public.is_client_user_of((SELECT auth.uid()), client_id))
WITH CHECK (public.is_client_user_of((SELECT auth.uid()), client_id));

DROP POLICY IF EXISTS "Client users disconnect own TikTok" ON public.tiktok_accounts;
CREATE POLICY "Client users disconnect own TikTok" ON public.tiktok_accounts FOR DELETE TO authenticated
USING (public.is_client_user_of((SELECT auth.uid()), client_id));

DROP POLICY IF EXISTS "Client users update own client" ON public.clients;
CREATE POLICY "Client users update own client" ON public.clients FOR UPDATE TO authenticated
USING (public.is_client_user_of((SELECT auth.uid()), id))
WITH CHECK (public.is_client_user_of((SELECT auth.uid()), id));

CREATE OR REPLACE FUNCTION public.guard_client_user_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND public.is_client_user_of(auth.uid(), OLD.id)
     AND (NEW.agency_id IS DISTINCT FROM OLD.agency_id OR NEW.name IS DISTINCT FROM OLD.name) THEN
    RAISE EXCEPTION 'Client users can only change their sales message settings';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_client_user_update() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_client_user_update ON public.clients;
CREATE TRIGGER guard_client_user_update BEFORE UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.guard_client_user_update();

-- Invites. Rows are created by the client-invite function (service role) only.
CREATE TABLE IF NOT EXISTS public.client_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  accepted_by UUID
);
CREATE UNIQUE INDEX IF NOT EXISTS client_invites_pending_email ON public.client_invites (lower(email)) WHERE accepted_at IS NULL;
ALTER TABLE public.client_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Agency admins view invites" ON public.client_invites;
CREATE POLICY "Agency admins view invites" ON public.client_invites FOR SELECT TO authenticated
USING (public.has_agency_role((SELECT auth.uid()), agency_id, 'owner') OR public.has_agency_role((SELECT auth.uid()), agency_id, 'admin'));
REVOKE ALL ON public.client_invites FROM anon, authenticated;
GRANT SELECT ON public.client_invites TO authenticated;
GRANT ALL ON public.client_invites TO service_role;

-- A pending invite means this signup belongs to an existing agency: no agency of their own.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_agency_id UUID;
  _type public.account_type;
  _company TEXT := NULLIF(trim(new.raw_user_meta_data ->> 'company_name'), '');
  _full_name TEXT := COALESCE(new.raw_user_meta_data ->> 'full_name', '');
BEGIN
  INSERT INTO public.profiles (id, email, full_name) VALUES (new.id, new.email, _full_name);

  IF EXISTS (SELECT 1 FROM public.client_invites WHERE lower(email) = lower(new.email) AND accepted_at IS NULL) THEN
    RETURN new;
  END IF;

  _type := CASE new.raw_user_meta_data ->> 'account_type'
             WHEN 'individual' THEN 'individual'::public.account_type
             ELSE 'agency'::public.account_type
           END;

  INSERT INTO public.agencies (name, account_type)
  VALUES (COALESCE(_company, NULLIF(_full_name, ''), 'My Agency'), _type)
  RETURNING id INTO new_agency_id;

  INSERT INTO public.agency_members (user_id, agency_id, role) VALUES (new.id, new_agency_id, 'owner');

  IF _type = 'individual' THEN
    INSERT INTO public.clients (agency_id, name)
    VALUES (new_agency_id, COALESCE(_company, NULLIF(_full_name, ''), 'My Business'));
  END IF;

  RETURN new;
END;
$$;

-- Called by the app after an invited user signs in: turns their (verified-email) invite into access.
CREATE OR REPLACE FUNCTION public.accept_client_invite()
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid UUID := auth.uid();
  _email TEXT;
  _inv public.client_invites%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RETURN NULL; END IF;
  SELECT lower(email) INTO _email FROM auth.users WHERE id = _uid AND email_confirmed_at IS NOT NULL;
  IF _email IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO _inv FROM public.client_invites WHERE lower(email) = _email AND accepted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO public.agency_members (user_id, agency_id, role, client_id)
  VALUES (_uid, _inv.agency_id, 'client', _inv.client_id) ON CONFLICT (user_id, agency_id) DO NOTHING;
  UPDATE public.client_invites SET accepted_at = now(), accepted_by = _uid WHERE id = _inv.id;
  RETURN _inv.client_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.accept_client_invite() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_client_invite() TO authenticated, service_role;

-- Server-side lookup for the invite function (never exposed to the browser).
CREATE OR REPLACE FUNCTION public.auth_user_by_email(_email TEXT)
RETURNS TABLE(id UUID, last_sign_in_at TIMESTAMPTZ) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.last_sign_in_at FROM auth.users u WHERE lower(u.email) = lower(_email)
$$;
REVOKE EXECUTE ON FUNCTION public.auth_user_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_by_email(text) TO service_role;
