-- Security review hardening (2026-11-07).

-- 1. rls_auto_enable() is an event-trigger helper; nobody should be able to call it through the API.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

-- 2. Pin the search path of the wallet-ledger trigger function (Supabase advisor warning).
ALTER FUNCTION public.wallet_entries_immutable() SET search_path = '';

-- 3. Upload buckets: a size cap and picture/video types only (the public catalog bucket must never serve
--    HTML or scripts from our storage address).
UPDATE storage.buckets
SET file_size_limit = 104857600,
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif','image/heic',
                               'video/mp4','video/quicktime','video/webm','video/3gpp']
WHERE id IN ('catalog', 'ad-media');
