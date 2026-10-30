-- SECURITY DEFINER helpers are only needed by signed-in users (RLS policies,
-- Settings team list) and edge functions; anon must not probe them.
REVOKE EXECUTE ON FUNCTION public.get_agency_members(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_agency_id(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_agency_role(uuid, uuid, public.agency_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_can_access_client(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_in_agency(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_agency_members(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_agency_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_agency_role(uuid, uuid, public.agency_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_access_client(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_in_agency(uuid, uuid) TO authenticated, service_role;
-- Trigger-only functions: never callable over the API.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.wob_enforce_individual_limits() FROM PUBLIC, anon, authenticated;
