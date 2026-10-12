-- Move tiktok_accounts.access_token/refresh_token out of plaintext columns
-- and into Supabase Vault (pgsodium-encrypted secrets store).
--
-- PREREQUISITE: Vault must already be enabled for this project (Supabase
-- Dashboard > Database > Vault > Enable Vault) before running this
-- migration — it assumes vault.create_secret/update_secret/decrypted_secrets
-- already exist.
--
-- Previously any agency member with "viewer" access to a client (not just
-- admins) could read the live TikTok access/refresh token in plaintext via
-- `select * from tiktok_accounts`, because the RLS policy is row-level, not
-- column-level. Moving the tokens into Vault closes that: the vault schema
-- isn't exposed over PostgREST, so decrypting now requires calling one of
-- the SECURITY DEFINER functions below, which are granted to service_role
-- only — the same privilege level the edge functions already run at.

ALTER TABLE public.tiktok_accounts
  ADD COLUMN IF NOT EXISTS access_token_secret_id uuid,
  ADD COLUMN IF NOT EXISTS refresh_token_secret_id uuid;

-- Backfill: move every existing plaintext token into Vault.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id, access_token, refresh_token FROM public.tiktok_accounts LOOP
    UPDATE public.tiktok_accounts
    SET access_token_secret_id = vault.create_secret(
      r.access_token,
      'tiktok_access_token_' || r.id,
      'TikTok access token for tiktok_accounts.id=' || r.id
    )
    WHERE id = r.id;

    IF r.refresh_token IS NOT NULL THEN
      UPDATE public.tiktok_accounts
      SET refresh_token_secret_id = vault.create_secret(
        r.refresh_token,
        'tiktok_refresh_token_' || r.id,
        'TikTok refresh token for tiktok_accounts.id=' || r.id
      )
      WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

-- Now that everything is backfilled, the plaintext columns can go.
ALTER TABLE public.tiktok_accounts
  DROP COLUMN access_token,
  DROP COLUMN refresh_token;

-- Create-or-update the tokens for an account, writing through to Vault.
-- Callers (edge functions, running as service_role) pass plaintext in;
-- nothing is stored unencrypted at rest.
CREATE OR REPLACE FUNCTION public.set_tiktok_tokens(
  _account_id uuid,
  _access_token text,
  _refresh_token text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  _existing_access uuid;
  _existing_refresh uuid;
  _new_refresh_id uuid;
BEGIN
  SELECT access_token_secret_id, refresh_token_secret_id
    INTO _existing_access, _existing_refresh
    FROM public.tiktok_accounts WHERE id = _account_id;

  IF _existing_access IS NOT NULL THEN
    PERFORM vault.update_secret(_existing_access, _access_token);
  ELSE
    _existing_access := vault.create_secret(
      _access_token, 'tiktok_access_token_' || _account_id
    );
  END IF;

  IF _refresh_token IS NOT NULL THEN
    IF _existing_refresh IS NOT NULL THEN
      PERFORM vault.update_secret(_existing_refresh, _refresh_token);
      _new_refresh_id := _existing_refresh;
    ELSE
      _new_refresh_id := vault.create_secret(
        _refresh_token, 'tiktok_refresh_token_' || _account_id
      );
    END IF;
  END IF;

  UPDATE public.tiktok_accounts
  SET access_token_secret_id = _existing_access,
      refresh_token_secret_id = COALESCE(_new_refresh_id, refresh_token_secret_id)
  WHERE id = _account_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_tiktok_tokens(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_tiktok_tokens(uuid, text, text) TO service_role;

-- Decrypt and return the tokens for one account.
CREATE OR REPLACE FUNCTION public.get_tiktok_tokens(_account_id uuid)
RETURNS TABLE(access_token text, refresh_token text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = ta.access_token_secret_id),
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = ta.refresh_token_secret_id)
  FROM public.tiktok_accounts ta
  WHERE ta.id = _account_id;
$$;

REVOKE ALL ON FUNCTION public.get_tiktok_tokens(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tiktok_tokens(uuid) TO service_role;

-- Decrypt and return tokens for every TikTok account belonging to a client
-- (sync-campaigns/fetch-campaigns iterate all accounts for one client).
CREATE OR REPLACE FUNCTION public.get_tiktok_tokens_for_client(_client_id uuid)
RETURNS TABLE(id uuid, advertiser_id text, access_token text, refresh_token text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT
    ta.id,
    ta.advertiser_id,
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = ta.access_token_secret_id),
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = ta.refresh_token_secret_id)
  FROM public.tiktok_accounts ta
  WHERE ta.client_id = _client_id;
$$;

REVOKE ALL ON FUNCTION public.get_tiktok_tokens_for_client(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tiktok_tokens_for_client(uuid) TO service_role;

-- Same as above but unscoped — refresh-tokens needs every account across
-- every client to find ones expiring soon.
CREATE OR REPLACE FUNCTION public.get_all_tiktok_tokens()
RETURNS TABLE(
  id uuid,
  client_id uuid,
  tenant_id uuid,
  advertiser_id text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT
    ta.id,
    ta.client_id,
    ta.tenant_id,
    ta.advertiser_id,
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = ta.access_token_secret_id),
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = ta.refresh_token_secret_id),
    ta.token_expires_at
  FROM public.tiktok_accounts ta;
$$;

REVOKE ALL ON FUNCTION public.get_all_tiktok_tokens() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_all_tiktok_tokens() TO service_role;
