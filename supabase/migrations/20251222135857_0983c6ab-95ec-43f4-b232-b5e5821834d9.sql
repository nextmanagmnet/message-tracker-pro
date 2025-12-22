-- Create agencies table (replaces tenants for this use case)
CREATE TABLE public.agencies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create clients table (belongs to agency)
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create agency_roles enum
CREATE TYPE public.agency_role AS ENUM ('owner', 'admin', 'viewer');

-- Create agency_members table (links users to agencies with roles)
CREATE TABLE public.agency_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  role agency_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, agency_id)
);

-- Create tiktok_pixels table (each client has their own pixel)
CREATE TABLE public.tiktok_pixels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  pixel_code TEXT NOT NULL,
  pixel_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add client_id to whatsapp_numbers
ALTER TABLE public.whatsapp_numbers ADD COLUMN client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE;

-- Add client_id to tiktok_accounts  
ALTER TABLE public.tiktok_accounts ADD COLUMN client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE;

-- Add client_id to tiktok_campaigns
ALTER TABLE public.tiktok_campaigns ADD COLUMN client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE;

-- Add client_id to leads
ALTER TABLE public.leads ADD COLUMN client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE;

-- Enable RLS on new tables
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiktok_pixels ENABLE ROW LEVEL SECURITY;

-- Helper function: Get user's agency_id
CREATE OR REPLACE FUNCTION public.get_user_agency_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT agency_id FROM public.agency_members WHERE user_id = _user_id LIMIT 1
$$;

-- Helper function: Check if user has agency role
CREATE OR REPLACE FUNCTION public.has_agency_role(_user_id UUID, _agency_id UUID, _role agency_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agency_members
    WHERE user_id = _user_id
      AND agency_id = _agency_id
      AND role = _role
  )
$$;

-- Helper function: Check if user belongs to agency
CREATE OR REPLACE FUNCTION public.user_in_agency(_user_id UUID, _agency_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agency_members
    WHERE user_id = _user_id
      AND agency_id = _agency_id
  )
$$;

-- Helper function: Check if user can access client
CREATE OR REPLACE FUNCTION public.user_can_access_client(_user_id UUID, _client_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clients c
    JOIN public.agency_members am ON am.agency_id = c.agency_id
    WHERE c.id = _client_id
      AND am.user_id = _user_id
  )
$$;

-- RLS Policies for agencies
CREATE POLICY "Users can view their agency"
ON public.agencies FOR SELECT
USING (user_in_agency(auth.uid(), id));

CREATE POLICY "Owners and admins can update their agency"
ON public.agencies FOR UPDATE
USING (has_agency_role(auth.uid(), id, 'owner') OR has_agency_role(auth.uid(), id, 'admin'));

-- RLS Policies for clients
CREATE POLICY "Users can view clients in their agency"
ON public.clients FOR SELECT
USING (user_in_agency(auth.uid(), agency_id));

CREATE POLICY "Owners and admins can manage clients"
ON public.clients FOR ALL
USING (has_agency_role(auth.uid(), agency_id, 'owner') OR has_agency_role(auth.uid(), agency_id, 'admin'));

-- RLS Policies for agency_members
CREATE POLICY "Users can view members in their agency"
ON public.agency_members FOR SELECT
USING (user_in_agency(auth.uid(), agency_id));

CREATE POLICY "Owners can manage agency members"
ON public.agency_members FOR ALL
USING (has_agency_role(auth.uid(), agency_id, 'owner'));

-- RLS Policies for tiktok_pixels
CREATE POLICY "Users can view pixels for clients in their agency"
ON public.tiktok_pixels FOR SELECT
USING (user_can_access_client(auth.uid(), client_id));

CREATE POLICY "Owners and admins can manage pixels"
ON public.tiktok_pixels FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = client_id
      AND (has_agency_role(auth.uid(), c.agency_id, 'owner') OR has_agency_role(auth.uid(), c.agency_id, 'admin'))
  )
);

-- Update RLS policies for whatsapp_numbers to use client_id
DROP POLICY IF EXISTS "Admins can manage WhatsApp numbers in their tenant" ON public.whatsapp_numbers;
DROP POLICY IF EXISTS "Users can view WhatsApp numbers in their tenant" ON public.whatsapp_numbers;

CREATE POLICY "Users can view WhatsApp numbers for their clients"
ON public.whatsapp_numbers FOR SELECT
USING (user_can_access_client(auth.uid(), client_id));

CREATE POLICY "Admins can manage WhatsApp numbers"
ON public.whatsapp_numbers FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = client_id
      AND (has_agency_role(auth.uid(), c.agency_id, 'owner') OR has_agency_role(auth.uid(), c.agency_id, 'admin'))
  )
);

-- Update RLS policies for tiktok_accounts to use client_id
DROP POLICY IF EXISTS "Admins can manage TikTok accounts in their tenant" ON public.tiktok_accounts;
DROP POLICY IF EXISTS "Users can view TikTok accounts in their tenant" ON public.tiktok_accounts;

CREATE POLICY "Users can view TikTok accounts for their clients"
ON public.tiktok_accounts FOR SELECT
USING (user_can_access_client(auth.uid(), client_id));

CREATE POLICY "Admins can manage TikTok accounts"
ON public.tiktok_accounts FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = client_id
      AND (has_agency_role(auth.uid(), c.agency_id, 'owner') OR has_agency_role(auth.uid(), c.agency_id, 'admin'))
  )
);

-- Update RLS policies for tiktok_campaigns to use client_id
DROP POLICY IF EXISTS "Admins can manage campaigns in their tenant" ON public.tiktok_campaigns;
DROP POLICY IF EXISTS "Users can view campaigns in their tenant" ON public.tiktok_campaigns;

CREATE POLICY "Users can view campaigns for their clients"
ON public.tiktok_campaigns FOR SELECT
USING (user_can_access_client(auth.uid(), client_id));

CREATE POLICY "Admins can manage campaigns"
ON public.tiktok_campaigns FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = client_id
      AND (has_agency_role(auth.uid(), c.agency_id, 'owner') OR has_agency_role(auth.uid(), c.agency_id, 'admin'))
  )
);

-- Update RLS policies for leads to use client_id
DROP POLICY IF EXISTS "Admins can update leads in their tenant" ON public.leads;
DROP POLICY IF EXISTS "Users can view leads in their tenant" ON public.leads;
DROP POLICY IF EXISTS "System can insert leads" ON public.leads;

CREATE POLICY "Users can view leads for their clients"
ON public.leads FOR SELECT
USING (user_can_access_client(auth.uid(), client_id));

CREATE POLICY "Admins can manage leads"
ON public.leads FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = client_id
      AND (has_agency_role(auth.uid(), c.agency_id, 'owner') OR has_agency_role(auth.uid(), c.agency_id, 'admin'))
  )
);

CREATE POLICY "System can insert leads"
ON public.leads FOR INSERT
WITH CHECK (true);

-- Update handle_new_user to create agency instead of tenant
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_agency_id UUID;
BEGIN
  -- Create a new agency for the user
  INSERT INTO public.agencies (name)
  VALUES (COALESCE(new.raw_user_meta_data ->> 'company_name', 'My Agency'))
  RETURNING id INTO new_agency_id;
  
  -- Create the user's profile
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data ->> 'full_name', '')
  );
  
  -- Add user as agency owner
  INSERT INTO public.agency_members (user_id, agency_id, role)
  VALUES (new.id, new_agency_id, 'owner');
  
  RETURN new;
END;
$$;

-- Add triggers for updated_at
CREATE TRIGGER update_agencies_updated_at
BEFORE UPDATE ON public.agencies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_clients_updated_at
BEFORE UPDATE ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tiktok_pixels_updated_at
BEFORE UPDATE ON public.tiktok_pixels
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();