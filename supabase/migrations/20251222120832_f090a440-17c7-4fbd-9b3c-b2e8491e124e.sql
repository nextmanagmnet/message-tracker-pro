-- Add unique constraint for tiktok_campaigns to enable upsert
ALTER TABLE public.tiktok_campaigns ADD CONSTRAINT tiktok_campaigns_tenant_campaign_unique UNIQUE (tenant_id, campaign_id);

-- Add unique constraint for tiktok_accounts to enable upsert
ALTER TABLE public.tiktok_accounts ADD CONSTRAINT tiktok_accounts_tenant_advertiser_unique UNIQUE (tenant_id, advertiser_id);