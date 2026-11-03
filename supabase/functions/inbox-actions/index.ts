import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cron.ts";
import { authorizeClient, serviceClient } from "../_shared/auth.ts";
import { withCors } from "../_shared/cors.ts";

// Team inbox. Body: { action: "team", clientId } | { action: "assign", conversationId, userId: string | null }.
// Owners/admins assign anyone on the agency staff; any staff member may take a chat or drop their own.
Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    try {
      const body = await req.json().catch(() => ({}));
      const service = serviceClient();

      if (body.action === "team") {
        const auth = await authorizeClient(req, body.clientId);
        if (auth instanceof Response) return auth;
        const { data: client } = await service.from("clients").select("agency_id").eq("id", body.clientId).single();
        // get_agency_members checks auth.uid(), so call it as the user (client users get an empty list).
        const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
          global: { headers: { Authorization: req.headers.get("Authorization")! } },
        });
        const { data, error } = await asUser.rpc("get_agency_members", { _agency_id: client?.agency_id });
        if (error) return json({ error: error.message }, 400);
        const members = (data ?? []).map((m: { user_id: string; email: string | null; full_name: string | null }) => ({
          userId: m.user_id,
          name: m.full_name || m.email || "",
          email: m.email,
        }));
        return json({ members });
      }

      if (body.action !== "assign") return json({ error: "Unknown action" }, 400);
      const { conversationId, userId } = body;
      if (typeof conversationId !== "string" || !conversationId)
        return json({ error: "conversationId is required" }, 400);
      if (userId !== null && (typeof userId !== "string" || !userId)) return json({ error: "Invalid userId" }, 400);

      const { data: conv } = await service
        .from("conversations")
        .select("id, client_id, assigned_to, clients(agency_id)")
        .eq("id", conversationId)
        .maybeSingle();
      if (!conv) return json({ error: "Conversation not found" }, 404);
      const auth = await authorizeClient(req, conv.client_id);
      if (auth instanceof Response) return auth;
      const agencyId = (conv.clients as unknown as { agency_id: string } | null)?.agency_id;
      if (!agencyId) return json({ error: "Client not found" }, 404);

      // Staff roles (never 'client') of the caller and the assignee in this agency.
      const ids = userId ? [auth.userId, userId] : [auth.userId];
      const { data: rows } = await service
        .from("agency_members")
        .select("user_id, role")
        .eq("agency_id", agencyId)
        .neq("role", "client")
        .in("user_id", ids);
      const roleOf = (id: string) => rows?.find((r) => r.user_id === id)?.role;
      const callerRole = roleOf(auth.userId);
      const canManage = callerRole === "owner" || callerRole === "admin";
      const allowed =
        canManage ||
        (callerRole !== undefined && (userId === auth.userId || (userId === null && conv.assigned_to === auth.userId)));
      if (!allowed) return json({ error: "You can only assign chats to yourself" }, 403);
      if (userId && !roleOf(userId)) return json({ error: "That person isn't on this team" }, 400);

      const { error } = await service
        .from("conversations")
        .update({ assigned_to: userId, assigned_at: userId ? new Date().toISOString() : null })
        .eq("id", conversationId);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true, assignedTo: userId });
    } catch (e) {
      console.error("inbox-actions error", e);
      return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
    }
  }),
);
