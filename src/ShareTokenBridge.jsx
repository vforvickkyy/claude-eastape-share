import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { shareLinksApi } from "./lib/api";

const PENDING_KEY = "pending_share_token";

/**
 * Watches for a login/signup completed while a share link's "unlock full
 * access" CTA is pending (token stashed in localStorage by DriveSharePage).
 * Once the user is authenticated, joins them to the shared project with the
 * link's role and drops them into the real authenticated app.
 */
export default function ShareTokenBridge() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const handled = useRef(false);

  useEffect(() => {
    if (!user || handled.current) return;
    const token = localStorage.getItem(PENDING_KEY);
    if (!token) return;
    handled.current = true;
    localStorage.removeItem(PENDING_KEY);
    shareLinksApi.join(token)
      .then(res => { if (res?.projectId) navigate(`/projects/${res.projectId}/files`, { replace: true }); })
      .catch(() => {});
  }, [user, navigate]);

  return null;
}

export function requestShareAccess(token) {
  localStorage.setItem(PENDING_KEY, token);
}
