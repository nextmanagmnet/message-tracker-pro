import { corsHeaders, json } from "../_shared/cron.ts";
import { authorizeAgencyAdmin, serviceClient } from "../_shared/auth.ts";
import { appOrigins, withCors } from "../_shared/cors.ts";
import { parseAccess, parseTeamInvite } from "../_shared/team.ts";

// Agency OWNERS add team members. Like client-invite, we hand back a one-time sign-in link to send
// (WhatsApp, email, anything), so this works without email delivery set up.
// Body: { action: "create", agencyId, email, role: "admin" | "viewer", permissions: string[] }
//     | { action: "revoke", inviteId }
//     | { action: "update", memberId, role, permissions }   (change an existing member)

function appOrigin(req: Request): string {
  const allowed = appOrigins(Deno.env.get("APP_ORIGINS"));
  const asked = req.headers.get("origin")?.replace(/\/$/, "") ?? "";
  return allowed.includes(asked) ? asked : (allowed[0] ?? "");
}

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    try {
      const body = await req.json().catch(() => ({}));
      const admin = serviceClient();

      // Resolve the agency from the invite / member, never from the caller's say-so.
      let agencyId: string | undefined;
      let invite: { id: string; agency_id: string; email: string; accepted_at: string | null } | null = null;
      let member: { id: string; agency_id: string; role: string; user_id: string } | null = null;
      if (body.action === "create") {
        agencyId = typeof body.agencyId === "string" ? body.agencyId : undefined;
      } else if (body.action === "revoke") {
        invite = (await admin.from("team_invites").select("*").eq("id", body.inviteId).maybeSingle()).data;
        agencyId = invite?.agency_id;
      } else if (body.action === "update") {
        member = (
          await admin
            .from("agency_members")
            .select("id, agency_id, role, user_id")
            .eq("id", body.memberId)
            .maybeSingle()
        ).data;
        agencyId = member?.agency_id;
      } else {
        return json({ error: "Unknown action" }, 400);
      }
      if (!agencyId) return json({ error: "Not found" }, 404);

      // Managing the team is for owners only; it is not a delegable permission.
      const auth = await authorizeAgencyAdmin(req, agencyId);
      if (auth instanceof Response) return auth;
      const { data: isOwner } = await admin.rpc("has_agency_role", {
        _user_id: auth.userId,
        _agency_id: agencyId,
        _role: "owner",
      });
      if (!isOwner) return json({ error: "Only the agency owner can manage the team", code: "no_permission" }, 403);

      if (body.action === "revoke") {
        if (invite!.accepted_at) return json({ error: "This invite was already accepted" }, 409);
        await admin.from("team_invites").delete().eq("id", invite!.id);
        // Drop the half-created login too, but only one this invite created (needs_password) that never signed in.
        const { data: u } = await admin.rpc("auth_user_by_email", { _email: invite!.email });
        if (u?.[0] && !u[0].last_sign_in_at) {
          const { data: found } = await admin.auth.admin.getUserById(u[0].id);
          if (found?.user?.user_metadata?.needs_password === true) await admin.auth.admin.deleteUser(u[0].id);
        }
        return json({ success: true });
      }

      if (body.action === "update") {
        const access = parseAccess(body);
        if (!access.ok) return json({ error: access.error }, 400);
        const { role, permissions } = access.value;
        if (member!.role === "owner" || member!.role === "client")
          return json({ error: "This member's role can't be changed here" }, 409);
        if (member!.user_id === auth.userId) return json({ error: "You can't change your own role" }, 409);
        const { error } = await admin
          .from("agency_members")
          .update({ role, permissions: role === "admin" ? permissions : [] })
          .eq("id", member!.id);
        if (error) throw error;
        return json({ success: true });
      }

      const parsed = parseTeamInvite(body);
      if (!parsed.ok) return json({ error: parsed.error }, 400);
      const { email, role, permissions } = parsed.value;

      const { data: existing } = await admin.rpc("auth_user_by_email", { _email: email });
      if (existing?.length)
        return json({ error: "That email already has a WOB account. Ask them to use a different email." }, 409);

      // The invite row must exist before the user does: the signup trigger reads it.
      const { data: row, error: insErr } = await admin
        .from("team_invites")
        .insert({ agency_id: agencyId, email, role, permissions, created_by: auth.userId })
        .select("id")
        .single();
      if (insErr || !row) return json({ error: "An invite for that email is already pending" }, 409);

      const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: { redirectTo: `${appOrigin(req)}/`, data: { needs_password: true } },
      });
      const url = link?.properties?.action_link;
      if (linkErr || !url) {
        await admin.from("team_invites").delete().eq("id", row.id);
        return json({ error: "Could not create the invite link" }, 500);
      }
      return json({ success: true, inviteId: row.id, link: url });
    } catch (e) {
      console.error("team-invite error", e);
      return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
    }
  }),
);
