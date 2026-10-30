import { corsHeaders, json } from "../_shared/cron.ts";
import { authorizeAgencyAdmin, serviceClient } from "../_shared/auth.ts";

// Agency owners/admins invite a client's own user. We hand back a one-time sign-in link to send
// (WhatsApp, email, anything), so this works without email delivery set up.
// Body: { action: "create", clientId, email } | { action: "revoke", inviteId }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function appOrigin(req: Request): string {
  const allowed = (Deno.env.get("APP_ORIGINS") ?? "").split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);
  const asked = req.headers.get("origin")?.replace(/\/$/, "") ?? "";
  return allowed.includes(asked) ? asked : allowed[0] ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const admin = serviceClient();

    // Resolve the agency from the client / invite, never from the caller's say-so.
    let agencyId: string | undefined;
    let invite: any = null;
    if (body.action === "create") {
      const { data: client } = await admin.from("clients").select("id, agency_id, name").eq("id", body.clientId).maybeSingle();
      agencyId = client?.agency_id;
    } else if (body.action === "revoke") {
      invite = (await admin.from("client_invites").select("*").eq("id", body.inviteId).maybeSingle()).data;
      agencyId = invite?.agency_id;
    } else {
      return json({ error: "Unknown action" }, 400);
    }
    if (!agencyId) return json({ error: "Not found" }, 404);
    const auth = await authorizeAgencyAdmin(req, agencyId);
    if (auth instanceof Response) return auth;

    if (body.action === "revoke") {
      if (invite.accepted_at) return json({ error: "This invite was already accepted" }, 409);
      await admin.from("client_invites").delete().eq("id", invite.id);
      // Drop the half-created login too, if they never signed in.
      const { data: u } = await admin.rpc("auth_user_by_email", { _email: invite.email });
      if (u?.[0] && !u[0].last_sign_in_at) await admin.auth.admin.deleteUser(u[0].id);
      return json({ success: true });
    }

    const email = String(body.email ?? "").trim().toLowerCase();
    if (!EMAIL.test(email)) return json({ error: "Enter a valid email address" }, 400);
    const { data: existing } = await admin.rpc("auth_user_by_email", { _email: email });
    if (existing?.length) return json({ error: "That email already has a WOB account. Use a different email for the client." }, 409);

    // The invite row must exist before the user does: the signup trigger reads it.
    const { data: row, error: insErr } = await admin.from("client_invites")
      .insert({ agency_id: agencyId, client_id: body.clientId, email, created_by: auth.userId })
      .select("id").single();
    if (insErr || !row) return json({ error: "An invite for that email is already pending" }, 409);

    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo: `${appOrigin(req)}/`, data: { needs_password: true } },
    });
    const url = link?.properties?.action_link;
    if (linkErr || !url) {
      await admin.from("client_invites").delete().eq("id", row.id);
      return json({ error: "Could not create the invite link" }, 500);
    }
    return json({ success: true, inviteId: row.id, link: url });
  } catch (e) {
    console.error("client-invite error", e);
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
  }
});
