-- Agencies and their linked users.
-- An agency connects its Business Center, sees its ad accounts, and invites each owner to sign up on WOB with their
-- own workspace. Once the owner accepts, the ad account is linked to the agency: the agency sees how the campaigns
-- are doing and funds the account, but never reads the user's chats, leads or phone numbers.
--
-- Privacy is enforced here, not in the app: agency staff have NO read access to a linked user's tables. They get two
-- functions that return numbers and campaign names only (agency_client_metrics / agency_client_campaigns).

-- The ad account's TikTok login is the agency's Business Center login for accounts it manages.
ALTER TABLE public.tiktok_accounts
  ADD COLUMN IF NOT EXISTS managed_by_agency_id uuid REFERENCES public.agencies(id) ON DELETE SET NULL;

-- One-time invite for an ad account. Only a hash of the token is stored, so a database leak can't reveal live links.
CREATE TABLE IF NOT EXISTS public.ad_account_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  advertiser_id text NOT NULL,
  advertiser_name text,
  token_hash text NOT NULL UNIQUE,
  note text CHECK (char_length(note) <= 200),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at timestamptz
);
-- At most one open invite per ad account (inviting again replaces it).
CREATE UNIQUE INDEX IF NOT EXISTS ad_account_invites_open ON public.ad_account_invites (agency_id, advertiser_id)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.agency_client_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  agency_name text NOT NULL, -- so the user can see who manages their account without reading the agency's data
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  advertiser_id text NOT NULL,
  advertiser_name text,
  invite_id uuid REFERENCES public.ad_account_invites(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  linked_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by text CHECK (revoked_by IN ('user', 'agency'))
);
-- An ad account is managed by one agency at a time.
CREATE UNIQUE INDEX IF NOT EXISTS agency_client_links_active ON public.agency_client_links (advertiser_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS agency_client_links_agency_idx ON public.agency_client_links (agency_id, status);
CREATE INDEX IF NOT EXISTS agency_client_links_client_idx ON public.agency_client_links (client_id, status);

-- ---------- Security ----------
ALTER TABLE public.ad_account_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_client_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency admins view invites" ON public.ad_account_invites;
CREATE POLICY "Agency admins view invites" ON public.ad_account_invites FOR SELECT TO authenticated
USING (public.has_agency_role((SELECT auth.uid()), agency_id, 'owner') OR public.has_agency_role((SELECT auth.uid()), agency_id, 'admin'));

-- The user sees who manages their account; agency staff see their own links (ids and names only, nothing from the user's data).
DROP POLICY IF EXISTS "Users and agency staff view links" ON public.agency_client_links;
CREATE POLICY "Users and agency staff view links" ON public.agency_client_links FOR SELECT TO authenticated
USING (public.user_can_access_client((SELECT auth.uid()), client_id)
    OR public.has_agency_role((SELECT auth.uid()), agency_id, 'owner')
    OR public.has_agency_role((SELECT auth.uid()), agency_id, 'admin')
    OR public.has_agency_role((SELECT auth.uid()), agency_id, 'viewer'));

REVOKE ALL ON public.ad_account_invites, public.agency_client_links FROM anon, authenticated;
GRANT SELECT ON public.ad_account_invites, public.agency_client_links TO authenticated;
GRANT ALL ON public.ad_account_invites, public.agency_client_links TO service_role;

-- ---------- What an agency may see about a linked client: numbers only, last 7 days ----------
-- (campaign spend comes from the 15-minute TikTok sync, which pulls a rolling 7-day window.)
CREATE OR REPLACE FUNCTION public.agency_client_metrics(p_agency uuid)
RETURNS TABLE (
  link_id uuid, client_id uuid, advertiser_id text, advertiser_name text, linked_at timestamptz,
  spend numeric, clicks bigint, impressions bigint,
  chats bigint, real_chats bigint, qualified bigint, orders bigint, revenue numeric, currency text,
  last_synced timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT l.id, l.client_id, l.advertiser_id, l.advertiser_name, l.linked_at,
         COALESCE(c.spend, 0), COALESCE(c.clicks, 0)::bigint, COALESCE(c.impressions, 0)::bigint,
         COALESCE(f.chats, 0), COALESCE(f.real_chats, 0), COALESCE(f.qualified, 0), COALESCE(f.orders, 0),
         COALESCE(f.revenue, 0), f.currency, c.last_synced
  FROM public.agency_client_links l
  LEFT JOIN LATERAL (
    SELECT sum(t.spend) AS spend, sum(t.clicks) AS clicks, sum(t.impressions) AS impressions, max(t.updated_at) AS last_synced
    FROM public.tiktok_campaigns t WHERE t.client_id = l.client_id
  ) c ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS chats,
           count(*) FILTER (WHERE x.stage IN ('real', 'qualified', 'client')) AS real_chats,
           count(*) FILTER (WHERE x.stage IN ('qualified', 'client')) AS qualified,
           count(*) FILTER (WHERE x.stage = 'client' AND x.order_status IS DISTINCT FROM 'returned') AS orders,
           COALESCE(sum(x.order_value) FILTER (WHERE x.stage = 'client' AND x.order_status IS DISTINCT FROM 'returned'), 0) AS revenue,
           mode() WITHIN GROUP (ORDER BY x.order_currency) FILTER (WHERE x.stage = 'client') AS currency
    FROM public.leads x WHERE x.client_id = l.client_id AND x.created_at >= now() - interval '7 days'
  ) f ON true
  WHERE l.agency_id = p_agency AND l.status = 'active'
    AND (public.has_agency_role((SELECT auth.uid()), p_agency, 'owner')
      OR public.has_agency_role((SELECT auth.uid()), p_agency, 'admin')
      OR public.has_agency_role((SELECT auth.uid()), p_agency, 'viewer'))
  ORDER BY COALESCE(c.spend, 0) DESC;
$$;

CREATE OR REPLACE FUNCTION public.agency_client_campaigns(p_agency uuid, p_client uuid)
RETURNS TABLE (
  campaign_id text, campaign_name text, spend numeric, clicks bigint, impressions bigint,
  chats bigint, real_chats bigint, qualified bigint, orders bigint, revenue numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT t.campaign_id, t.campaign_name, COALESCE(t.spend, 0), COALESCE(t.clicks, 0)::bigint, COALESCE(t.impressions, 0)::bigint,
         COALESCE(f.chats, 0), COALESCE(f.real_chats, 0), COALESCE(f.qualified, 0), COALESCE(f.orders, 0), COALESCE(f.revenue, 0)
  FROM public.tiktok_campaigns t
  LEFT JOIN LATERAL (
    SELECT count(*) AS chats,
           count(*) FILTER (WHERE x.stage IN ('real', 'qualified', 'client')) AS real_chats,
           count(*) FILTER (WHERE x.stage IN ('qualified', 'client')) AS qualified,
           count(*) FILTER (WHERE x.stage = 'client' AND x.order_status IS DISTINCT FROM 'returned') AS orders,
           COALESCE(sum(x.order_value) FILTER (WHERE x.stage = 'client' AND x.order_status IS DISTINCT FROM 'returned'), 0) AS revenue
    FROM public.leads x
    WHERE x.client_id = t.client_id AND x.campaign_id = t.campaign_id AND x.created_at >= now() - interval '7 days'
  ) f ON true
  WHERE t.client_id = p_client
    AND EXISTS (SELECT 1 FROM public.agency_client_links l WHERE l.agency_id = p_agency AND l.client_id = p_client AND l.status = 'active')
    AND (public.has_agency_role((SELECT auth.uid()), p_agency, 'owner')
      OR public.has_agency_role((SELECT auth.uid()), p_agency, 'admin')
      OR public.has_agency_role((SELECT auth.uid()), p_agency, 'viewer'))
  ORDER BY COALESCE(t.spend, 0) DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.agency_client_metrics(uuid), public.agency_client_campaigns(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_client_metrics(uuid), public.agency_client_campaigns(uuid, uuid) TO authenticated, service_role;

-- ---------- Accepting an invite and ending a link: atomic, service role only ----------
-- Raises: invite_invalid | account_not_in_agency | own_agency | already_linked (an ad account has one managing agency).
-- A plan limit (WOB_LIMIT) from the tiktok_accounts trigger passes through unchanged.
CREATE OR REPLACE FUNCTION public.accept_agency_invite(p_hash text, p_client uuid, p_user uuid, p_agency_token text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE inv public.ad_account_invites; cl public.clients; ag public.agencies; v_link uuid;
BEGIN
  SELECT * INTO inv FROM public.ad_account_invites WHERE token_hash = p_hash FOR UPDATE;
  IF NOT FOUND OR inv.accepted_at IS NOT NULL OR inv.revoked_at IS NOT NULL OR inv.expires_at < now() THEN
    RAISE EXCEPTION 'invite_invalid';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bc_accounts b WHERE b.agency_id = inv.agency_id AND b.advertiser_id = inv.advertiser_id) THEN
    RAISE EXCEPTION 'account_not_in_agency';
  END IF;
  SELECT * INTO cl FROM public.clients WHERE id = p_client;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite_invalid'; END IF;
  IF cl.agency_id = inv.agency_id THEN RAISE EXCEPTION 'own_agency'; END IF;
  SELECT * INTO ag FROM public.agencies WHERE id = inv.agency_id;

  IF EXISTS (SELECT 1 FROM public.tiktok_accounts t WHERE t.client_id = p_client AND t.advertiser_id = inv.advertiser_id) THEN
    UPDATE public.tiktok_accounts SET access_token = p_agency_token, managed_by_agency_id = inv.agency_id
    WHERE client_id = p_client AND advertiser_id = inv.advertiser_id;
  ELSE
    INSERT INTO public.tiktok_accounts (client_id, tenant_id, advertiser_id, advertiser_name, access_token, managed_by_agency_id)
    VALUES (p_client, cl.agency_id, inv.advertiser_id, inv.advertiser_name, p_agency_token, inv.agency_id);
  END IF;

  BEGIN
    INSERT INTO public.agency_client_links (agency_id, agency_name, client_id, advertiser_id, advertiser_name, invite_id)
    VALUES (inv.agency_id, ag.name, p_client, inv.advertiser_id, inv.advertiser_name, inv.id)
    RETURNING id INTO v_link;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'already_linked';
  END;
  UPDATE public.ad_account_invites SET accepted_at = now(), accepted_by = p_user WHERE id = inv.id;
  RETURN v_link;
END $$;

-- Ends a link from either side. The agency's login copy is deleted with the ad account row, so access stops at once;
-- the user keeps their own history (campaign rows, leads, chats).
CREATE OR REPLACE FUNCTION public.end_agency_link(p_link uuid, p_by text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE l public.agency_client_links;
BEGIN
  IF p_by NOT IN ('user', 'agency') THEN RAISE EXCEPTION 'bad_actor'; END IF;
  SELECT * INTO l FROM public.agency_client_links WHERE id = p_link FOR UPDATE;
  IF NOT FOUND OR l.status <> 'active' THEN RAISE EXCEPTION 'not_active'; END IF;
  UPDATE public.agency_client_links SET status = 'revoked', revoked_at = now(), revoked_by = p_by WHERE id = p_link;
  DELETE FROM public.tiktok_accounts
  WHERE client_id = l.client_id AND advertiser_id = l.advertiser_id AND managed_by_agency_id = l.agency_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.accept_agency_invite(text, uuid, uuid, text), public.end_agency_link(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_agency_invite(text, uuid, uuid, text), public.end_agency_link(uuid, text) TO service_role;
