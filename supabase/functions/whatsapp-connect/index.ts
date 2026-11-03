import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { corsHeaders, json } from "../_shared/cron.ts";
import { withCors } from "../_shared/cors.ts";
import { evolutionClient, qrAction } from "./evolution.ts";
import {
  embeddedSignup,
  fetchPhoneNumbers,
  fetchWabas,
  importNumbers,
  lookupWaba,
  validateToken,
} from "./meta-cloud.ts";
import { disconnect, reconnect, remove } from "./numbers.ts";
import type { ConnectBody, ConnectContext } from "./types.ts";

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const whatsappToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";

    // Validate JWT and get user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = claimsData.claims.sub as string;

    try {
      const body: ConnectBody = await req.json();
      const { action, clientId } = body;

      if (!clientId) {
        return json({ error: "clientId is required" }, 400);
      }

      // Verify user can access this client
      const { data: canAccess } = await supabase.rpc("user_can_access_client", {
        _user_id: userId,
        _client_id: clientId,
      });
      if (!canAccess) {
        return json({ error: "Access denied" }, 403);
      }

      // Get client's tenant_id
      const { data: clientData, error: clientError } = await supabase
        .from("clients")
        .select("agency_id")
        .eq("id", clientId)
        .single();

      if (clientError || !clientData) {
        return json({ error: "Client not found" }, 404);
      }

      // The tenant_id column exists for legacy compatibility
      const ctx: ConnectContext = {
        supabase,
        supabaseUrl,
        whatsappToken,
        body,
        clientId,
        tenantId: clientData.agency_id,
        evo: evolutionClient(),
      };

      if (action?.startsWith("qr-")) return await qrAction(ctx, action);
      switch (action) {
        case "validate-token":
          return await validateToken(ctx);
        case "fetch-wabas":
          return await fetchWabas(ctx);
        case "lookup-waba":
          return await lookupWaba(ctx);
        case "fetch-phone-numbers":
          return await fetchPhoneNumbers(ctx);
        case "embedded-signup":
          return await embeddedSignup(ctx);
        case "import-numbers":
          return await importNumbers(ctx);
        case "disconnect":
          return await disconnect(ctx);
        case "reconnect":
          return await reconnect(ctx);
        case "remove":
          return await remove(ctx);
        default:
          return json({ error: "Unknown action" }, 400);
      }
    } catch (error) {
      console.error("Error:", error);
      const message = error instanceof Error ? error.message : "Internal error";
      return json({ error: message }, 500);
    }
  }),
);
