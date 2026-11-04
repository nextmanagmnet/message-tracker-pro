-- Team members with specific permissions.
--
-- Roles stay: owner (everything, including the team), admin, viewer (read only).
-- An admin can now be limited to some of the agency-level jobs:
--   clients      create, edit and delete the agency's own clients
--   funding      fund accounts, approve or decline top-ups, wallet payments and fees
--   ad_accounts  invite users to link their ad account, unlink them
-- permissions = NULL means "all of them" (every admin before this migration keeps working unchanged).
-- Only an owner can change a member's role or permissions (existing owner-only policy on agency_members).

ALTER TABLE public.agency_members ADD COLUMN IF NOT EXISTS permissions TEXT[];
ALTER TABLE public.agency_members DROP CONSTRAINT IF EXISTS agency_members_permissions_chk;
ALTER TABLE public.agency_members ADD CONSTRAINT agency_members_permissions_chk
  CHECK (permissions IS NULL OR permissions <@ ARRAY['clients', 'funding', 'ad_accounts']::TEXT[]);

CREATE OR REPLACE FUNCTION public.has_agency_permission(_user_id UUID, _agency_id UUID, _perm TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agency_members m
    WHERE m.user_id = _user_id AND m.agency_id = _agency_id
      AND (m.role = 'owner'
           OR (m.role = 'admin' AND (m.permissions IS NULL OR _perm = ANY (m.permissions))))
  )
$$;
REVOKE EXECUTE ON FUNCTION public.has_agency_permission(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_agency_permission(uuid, uuid, text) TO authenticated, service_role;

-- Creating, editing and deleting the agency's own clients now needs the "clients" permission.
DROP POLICY IF EXISTS "Owners and admins can manage clients" ON public.clients;
CREATE POLICY "Owners and admins can manage clients" ON public.clients FOR ALL TO authenticated
USING (public.has_agency_permission((SELECT auth.uid()), agency_id, 'clients'))
WITH CHECK (public.has_agency_permission((SELECT auth.uid()), agency_id, 'clients'));

-- Invites. Rows are created by the team-invite function (service role) only, like client invites.
CREATE TABLE IF NOT EXISTS public.team_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.agency_role NOT NULL CHECK (role IN ('admin', 'viewer')),
  permissions TEXT[] NOT NULL DEFAULT '{}' CHECK (permissions <@ ARRAY['clients', 'funding', 'ad_accounts']::TEXT[]),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  accepted_by UUID
);
CREATE UNIQUE INDEX IF NOT EXISTS team_invites_pending_email ON public.team_invites (lower(email)) WHERE accepted_at IS NULL;
CREATE INDEX IF NOT EXISTS team_invites_agency_idx ON public.team_invites (agency_id);
ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners view team invites" ON public.team_invites;
CREATE POLICY "Owners view team invites" ON public.team_invites FOR SELECT TO authenticated
USING (public.has_agency_role((SELECT auth.uid()), agency_id, 'owner'));
REVOKE ALL ON public.team_invites FROM anon, authenticated;
GRANT SELECT ON public.team_invites TO authenticated;
GRANT ALL ON public.team_invites TO service_role;

-- A pending client OR team invite means this signup belongs to an existing agency: no workspace of their own.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_agency_id UUID;
  _type public.account_type;
  _company TEXT := NULLIF(trim(new.raw_user_meta_data ->> 'company_name'), '');
  _full_name TEXT := COALESCE(new.raw_user_meta_data ->> 'full_name', '');
BEGIN
  INSERT INTO public.profiles (id, email, full_name) VALUES (new.id, new.email, _full_name);

  IF EXISTS (SELECT 1 FROM public.client_invites WHERE lower(email) = lower(new.email) AND accepted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.team_invites WHERE lower(email) = lower(new.email) AND accepted_at IS NULL) THEN
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

-- Called by the app after an invited user signs in: turns their (verified-email) invite into membership.
CREATE OR REPLACE FUNCTION public.accept_team_invite()
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid UUID := auth.uid();
  _email TEXT;
  _inv public.team_invites%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RETURN NULL; END IF;
  SELECT lower(email) INTO _email FROM auth.users WHERE id = _uid AND email_confirmed_at IS NOT NULL;
  IF _email IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO _inv FROM public.team_invites WHERE lower(email) = _email AND accepted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO public.agency_members (user_id, agency_id, role, permissions)
  VALUES (_uid, _inv.agency_id, _inv.role, CASE WHEN _inv.role = 'admin' THEN _inv.permissions ELSE '{}' END)
  ON CONFLICT (user_id, agency_id) DO NOTHING;
  UPDATE public.team_invites SET accepted_at = now(), accepted_by = _uid WHERE id = _inv.id;
  RETURN _inv.agency_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.accept_team_invite() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_team_invite() TO authenticated, service_role;

-- The members list also returns each member's permissions.
DROP FUNCTION IF EXISTS public.get_agency_members(uuid);
CREATE FUNCTION public.get_agency_members(_agency_id uuid)
RETURNS TABLE(member_id uuid, user_id uuid, role agency_role, email text, full_name text, created_at timestamptz, permissions text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT am.id, am.user_id, am.role, p.email, p.full_name, am.created_at, am.permissions
  FROM public.agency_members am
  LEFT JOIN public.profiles p ON p.id = am.user_id
  WHERE am.agency_id = _agency_id
    AND am.role <> 'client'
    AND public.user_in_agency(auth.uid(), _agency_id)
  ORDER BY am.created_at
$$;
REVOKE EXECUTE ON FUNCTION public.get_agency_members(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_agency_members(uuid) TO authenticated, service_role;

-- Fees and payment instructions are written from the browser, so the policy itself needs the funding permission.
DROP POLICY IF EXISTS "Agency admins manage wallet settings" ON public.agency_wallet_settings;
CREATE POLICY "Agency admins manage wallet settings" ON public.agency_wallet_settings FOR ALL TO authenticated
USING (public.has_agency_permission((SELECT auth.uid()), agency_id, 'funding'))
WITH CHECK (public.has_agency_permission((SELECT auth.uid()), agency_id, 'funding'));
