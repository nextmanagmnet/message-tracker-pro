import { limitError } from "../_shared/auth.ts";
import { json } from "../_shared/cron.ts";
import type { ConnectContext } from "./types.ts";

// Evolution API gateway: one instance per WhatsApp line, owned by one client
export function evolutionClient() {
  const base = (Deno.env.get("EVOLUTION_API_URL") || "").replace(/\/+$/, "");
  const key = Deno.env.get("EVOLUTION_API_KEY") || "";
  const call = async (path: string, init?: RequestInit) => {
    const r = await fetch(`${base}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", apikey: key, ...(init?.headers || {}) },
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error("Evolution error", r.status, JSON.stringify(d));
      throw new Error(`WhatsApp gateway error (${r.status})`);
    }
    return d;
  };
  const state = async (n: string) => {
    const s = await call(`/instance/connectionState/${n}`).catch(() => ({}));
    return (s?.instance?.state || s?.state || "close") as string;
  };
  return { base, key, call, state };
}

export type EvolutionClient = ReturnType<typeof evolutionClient>;

const stripQr = (b: unknown) =>
  typeof b === "string" && b ? b.replace(/^data:image\/\w+;base64,/, "") : null;

// QR / linked-device actions: qr-start, qr-status, qr-logout.
export async function qrAction(ctx: ConnectContext, action: string): Promise<Response> {
  const { supabase, clientId, tenantId, evo, body } = ctx;
  const clientPrefix = `wc_${String(clientId).replace(/-/g, "")}_`;
  const reqInstance = typeof body.instance === "string" ? body.instance : null;
  const ownInstance = (n: string | null) => !!n && n.startsWith(clientPrefix) && /^[a-z0-9_]+$/.test(n);

  if (!evo.base || !evo.key) {
    return json({ error: "WhatsApp gateway is not configured yet." });
  }
  if ((action === "qr-status" || action === "qr-logout") && !ownInstance(reqInstance)) {
    return json({ error: "Session expired, please try again." });
  }

  switch (action) {
    case "qr-start": {
      const name = ownInstance(reqInstance)
        ? reqInstance!
        : `${clientPrefix}${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
      let qr: string | null = null;
      if (!ownInstance(reqInstance)) {
        const created = await evo.call("/instance/create", {
          method: "POST",
          body: JSON.stringify({
            instanceName: name,
            qrcode: true,
            integration: "WHATSAPP-BAILEYS",
            webhook: {
              url: `${ctx.supabaseUrl}/functions/v1/whatsapp-webhook`,
              byEvents: false,
              base64: false,
              headers: { authorization: `Bearer ${Deno.env.get("WHATSAPP_VERIFY_TOKEN") || ""}` },
              events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
            },
          }),
        });
        qr = stripQr(created?.qrcode?.base64);
      }
      if (!qr) {
        const c = await evo.call(`/instance/connect/${name}`).catch(() => ({}));
        qr = stripQr(c?.base64);
      }
      if ((await evo.state(name)) === "open") return json({ instance: name, state: "authorized" });
      if (!qr) return json({ instance: name, error: "QR not ready, try again" });
      return json({ instance: name, state: "qr", qr });
    }

    case "qr-status": {
      const name = reqInstance!;
      const state = await evo.state(name);
      if (state !== "open") {
        const c = await evo.call(`/instance/connect/${name}`).catch(() => ({}));
        return json({ instance: name, state, qr: stripQr(c?.base64) });
      }
      const list = await evo.call(`/instance/fetchInstances?instanceName=${name}`).catch(() => []);
      const info = Array.isArray(list) ? list[0] : list;
      const owner = String(info?.ownerJid || info?.instance?.owner || info?.number || "").split("@")[0];
      const phone = owner ? `+${owner.replace(/\D/g, "")}` : "WhatsApp";

      const { data: other } = await supabase.from("whatsapp_numbers").select("id, client_id")
        .eq("phone_number_id", name).maybeSingle();
      if (other && other.client_id !== clientId) {
        return json({ state: "authorized", error: "This WhatsApp line is already linked to another client." });
      }
      const { error: upErr } = other
        ? await supabase.from("whatsapp_numbers").update({ status: "connected", phone_number: phone }).eq("id", other.id)
        : await supabase.from("whatsapp_numbers").insert({
            client_id: clientId, tenant_id: tenantId, phone_number: phone,
            phone_number_id: name, waba_id: "evolution", status: "connected",
          });
      if (upErr) return limitError(upErr) ?? json({ state: "authorized", error: upErr.message });
      return json({ instance: name, state: "connected", phoneNumber: phone });
    }

    case "qr-logout": {
      await evo.call(`/instance/logout/${reqInstance}`, { method: "DELETE" }).catch(() => ({}));
      await supabase.from("whatsapp_numbers").update({ status: "disconnected" })
        .eq("phone_number_id", reqInstance).eq("client_id", clientId);
      return json({ success: true });
    }

    default:
      return json({ error: "Unknown action" }, 400);
  }
}
