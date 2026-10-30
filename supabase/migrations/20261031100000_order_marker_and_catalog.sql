-- Sales detection message + product catalog (images/videos) for the AI agent.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS order_marker TEXT NOT NULL DEFAULT 'ORDER CONFIRMED';

CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(12,2),
  currency TEXT NOT NULL DEFAULT 'USD',
  in_stock BOOLEAN NOT NULL DEFAULT true,
  images TEXT[] NOT NULL DEFAULT '{}',
  videos TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_client_idx ON public.products (client_id);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view products" ON public.products;
CREATE POLICY "Members view products" ON public.products FOR SELECT TO authenticated
USING (public.user_can_access_client((SELECT auth.uid()), client_id));

DROP POLICY IF EXISTS "Admins manage products" ON public.products;
CREATE POLICY "Admins manage products" ON public.products FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = products.client_id
  AND (public.has_agency_role((SELECT auth.uid()), c.agency_id, 'owner') OR public.has_agency_role((SELECT auth.uid()), c.agency_id, 'admin'))))
WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = products.client_id
  AND (public.has_agency_role((SELECT auth.uid()), c.agency_id, 'owner') OR public.has_agency_role((SELECT auth.uid()), c.agency_id, 'admin'))));

REVOKE ALL ON public.products FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

-- Public bucket (WhatsApp must fetch the media by URL); uploads limited to the client's own folder.
INSERT INTO storage.buckets (id, name, public) VALUES ('catalog', 'catalog', true) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Members upload catalog media" ON storage.objects;
CREATE POLICY "Members upload catalog media" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'catalog' AND public.user_can_access_client((SELECT auth.uid()), ((storage.foldername(name))[1])::uuid));
DROP POLICY IF EXISTS "Members delete catalog media" ON storage.objects;
CREATE POLICY "Members delete catalog media" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'catalog' AND public.user_can_access_client((SELECT auth.uid()), ((storage.foldername(name))[1])::uuid));
