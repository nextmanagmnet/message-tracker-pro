import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { getJoinToken, shouldRedirect } from "@/lib/join";

/** Sends a signed-in user back to /join when an invite link is waiting (after sign-up, sign-in or email confirmation). */
export function PendingJoinRedirect() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (shouldRedirect(pathname, !!getJoinToken(), !!user)) navigate("/join", { replace: true });
  }, [pathname, user, navigate]);
  return null;
}
