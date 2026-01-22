import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type PendingOAuth = {
  clientId: string;
  state: string;
  createdAt: number;
};

const STORAGE_KEY = "tiktok_oauth_pending";

function readPending(): PendingOAuth | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingOAuth;
  } catch {
    return null;
  }
}

const TikTokCallback = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [isWorking, setIsWorking] = useState(true);

  const code = useMemo(() => params.get("code"), [params]);
  const returnedState = useMemo(() => params.get("state"), [params]);
  const error = useMemo(() => params.get("error"), [params]);
  const errorDescription = useMemo(() => params.get("error_description"), [params]);

  useEffect(() => {
    (async () => {
      try {
        if (error) {
          toast.error(errorDescription || "TikTok authorization was cancelled");
          navigate("/tiktok", { replace: true });
          return;
        }

        if (!code || !returnedState) {
          toast.error("Missing TikTok callback parameters");
          navigate("/tiktok", { replace: true });
          return;
        }

        const pending = readPending();
        if (!pending) {
          toast.error("No pending TikTok connection found. Please try connecting again.");
          navigate("/tiktok", { replace: true });
          return;
        }

        // Basic replay protection: require exact state match.
        if (pending.state !== returnedState) {
          toast.error("TikTok state mismatch. Please try connecting again.");
          navigate("/tiktok", { replace: true });
          return;
        }

        const { data, error: invokeError } = await supabase.functions.invoke("tiktok-oauth", {
          body: {
            action: "callback",
            code,
            clientId: pending.clientId,
          },
        });

        if (invokeError) {
          console.error("TikTok callback invoke error:", invokeError);
          toast.error("Failed to complete TikTok connection");
          navigate("/tiktok", { replace: true });
          return;
        }

        if (data?.error) {
          console.error("TikTok callback error:", data);
          toast.error(data?.error || "Failed to complete TikTok connection");
          navigate("/tiktok", { replace: true });
          return;
        }

        sessionStorage.removeItem(STORAGE_KEY);
        toast.success("TikTok connected successfully");
        navigate("/tiktok", { replace: true });
      } finally {
        setIsWorking(false);
      }
    })();
  }, [code, returnedState, error, errorDescription, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="glass-card p-8 max-w-md w-full">
        <h1 className="text-xl font-semibold text-foreground">Connecting TikTok…</h1>
        <p className="text-sm text-muted-foreground mt-2">
          {isWorking
            ? "Finishing authorization and saving your advertiser account."
            : "You can close this page."}
        </p>
      </div>
    </div>
  );
};

export default TikTokCallback;
