ALTER TABLE public.whatsapp_numbers DROP CONSTRAINT IF EXISTS whatsapp_numbers_tenant_id_fkey;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_tenant_id_fkey;
ALTER TABLE public.tiktok_accounts DROP CONSTRAINT IF EXISTS tiktok_accounts_tenant_id_fkey;
ALTER TABLE public.tiktok_campaigns DROP CONSTRAINT IF EXISTS tiktok_campaigns_tenant_id_fkey;
COMMENT ON COLUMN public.whatsapp_numbers.tenant_id IS 'DEPRECATED: legacy; holds agency_id. Use client_id.';
COMMENT ON COLUMN public.leads.tenant_id IS 'DEPRECATED: legacy; holds agency_id. Use client_id.';
COMMENT ON COLUMN public.tiktok_accounts.tenant_id IS 'DEPRECATED: legacy; holds agency_id. Use client_id.';
COMMENT ON COLUMN public.tiktok_campaigns.tenant_id IS 'DEPRECATED: legacy; holds agency_id. Use client_id.';