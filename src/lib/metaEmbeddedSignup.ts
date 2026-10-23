const APP_ID = "1635724714898789";
const CONFIG_ID = "2534181420397430";

declare global {
  interface Window { FB?: any; fbAsyncInit?: () => void }
}

let sdkPromise: Promise<void> | null = null;
function loadSdk(): Promise<void> {
  if (window.FB) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB.init({ appId: APP_ID, autoLogAppEvents: true, xfbml: false, version: "v21.0" });
      resolve();
    };
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/en_US/sdk.js";
    s.async = true;
    s.crossOrigin = "anonymous";
    s.onerror = () => { sdkPromise = null; reject(new Error("Could not load Facebook. Check ad blockers.")); };
    document.body.appendChild(s);
  });
  return sdkPromise;
}

export interface SignupResult { code: string; wabaId: string; phoneNumberId: string }

export async function launchEmbeddedSignup(): Promise<SignupResult> {
  await loadSdk();
  let session: { wabaId?: string; phoneNumberId?: string } = {};
  let cancelled: string | null = null;
  const onMsg = (e: MessageEvent) => {
    if (!String(e.origin).endsWith("facebook.com")) return;
    try {
      const d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      if (d?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (d.event === "FINISH" || d.event === "FINISH_ONLY_WABA") {
        session = { wabaId: d.data?.waba_id, phoneNumberId: d.data?.phone_number_id };
      } else if (d.event === "CANCEL") {
        cancelled = d.data?.current_step || "cancelled";
      }
    } catch { /* ignore non-JSON */ }
  };
  window.addEventListener("message", onMsg);
  try {
    const code = await new Promise<string>((resolve, reject) => {
      window.FB.login(
        (res: any) => res?.authResponse?.code ? resolve(res.authResponse.code) : reject(new Error("Signup was closed before finishing.")),
        { config_id: CONFIG_ID, response_type: "code", override_default_response_type: true,
          extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" } }
      );
    });
    // session message may arrive slightly after the login callback
    for (let i = 0; i < 20 && !session.wabaId; i++) await new Promise((r) => setTimeout(r, 150));
    if (cancelled && !session.wabaId) throw new Error("Signup was cancelled.");
    if (!session.wabaId || !session.phoneNumberId) throw new Error("No phone number was selected in the signup.");
    return { code, wabaId: session.wabaId, phoneNumberId: session.phoneNumberId };
  } finally {
    window.removeEventListener("message", onMsg);
  }
}
