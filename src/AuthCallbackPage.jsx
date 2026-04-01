import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./lib/supabaseClient";
import { motion } from "framer-motion";

const SESSION_KEY = "ets_auth";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function checkOnboarding(accessToken, userId) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=onboarding_completed`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` } }
    );
    const data = await res.json();
    return data?.[0]?.onboarding_completed === true;
  } catch { return true; } // default to dashboard on error
}

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    async function handleCallback() {
      try {
        const url   = new URL(window.location.href);
        const code  = url.searchParams.get("code");
        const hash  = window.location.hash.slice(1); // strip leading '#'

        async function finishWithSession(session) {
          localStorage.setItem(SESSION_KEY, JSON.stringify(session));
          const done = await checkOnboarding(session.access_token, session.user?.id);
          navigate(done ? "/" : "/onboarding", { replace: true });
        }

        if (code) {
          // ── PKCE flow: ?code=xxx ──────────────────────────────
          const { data, error } = await supabase.auth.exchangeCodeForSession(window.location.href);
          if (error) throw error;
          if (data?.session) { await finishWithSession(data.session); return; }
        }

        if (hash) {
          // ── Implicit flow: #access_token=xxx&refresh_token=xxx ─
          const params        = new URLSearchParams(hash);
          const access_token  = params.get("access_token");
          const refresh_token = params.get("refresh_token");

          if (access_token) {
            const { data, error } = await supabase.auth.setSession({ access_token, refresh_token: refresh_token ?? "" });
            if (error) throw error;
            if (data?.session) { await finishWithSession(data.session); return; }
          }
        }

        // ── Fallback: let Supabase detect session from URL ──────
        const { data: { session } } = await supabase.auth.getSession();
        if (session) { await finishWithSession(session); return; }

        throw new Error("No session returned from Google. Please try again.");
      } catch (err) {
        setError(err.message || "Authentication failed.");
      }
    }

    handleCallback();
  }, []);

  return (
    <div className="page" style={{ alignItems: "center", justifyContent: "center" }}>
      <div className="noise" />
      {error ? (
        <motion.div
          className="glass-card"
          style={{ maxWidth: 360, width: "100%", textAlign: "center", gap: 16 }}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <p style={{ color: "#f87171", fontSize: 14 }}>{error}</p>
          <button className="btn-primary-sm" onClick={() => navigate("/login")}>
            Back to Login
          </button>
        </motion.div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <span className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
          <p style={{ color: "var(--t3)", fontSize: 13 }}>Signing you in…</p>
        </div>
      )}
    </div>
  );
}
