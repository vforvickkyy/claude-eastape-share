import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./lib/supabaseClient";
import { motion } from "framer-motion";

const SESSION_KEY = "ets_auth";

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    async function handleCallback() {
      try {
        const url   = new URL(window.location.href);
        const code  = url.searchParams.get("code");
        const hash  = window.location.hash.slice(1); // strip leading '#'

        if (code) {
          // ── PKCE flow: ?code=xxx ──────────────────────────────
          const { data, error } = await supabase.auth.exchangeCodeForSession(window.location.href);
          if (error) throw error;
          if (data?.session) {
            localStorage.setItem(SESSION_KEY, JSON.stringify(data.session));
            navigate("/", { replace: true });
            return;
          }
        }

        if (hash) {
          // ── Implicit flow: #access_token=xxx&refresh_token=xxx ─
          const params        = new URLSearchParams(hash);
          const access_token  = params.get("access_token");
          const refresh_token = params.get("refresh_token");

          if (access_token) {
            const { data, error } = await supabase.auth.setSession({ access_token, refresh_token: refresh_token ?? "" });
            if (error) throw error;
            if (data?.session) {
              localStorage.setItem(SESSION_KEY, JSON.stringify(data.session));
              navigate("/", { replace: true });
              return;
            }
          }
        }

        // ── Fallback: let Supabase detect session from URL ──────
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          localStorage.setItem(SESSION_KEY, JSON.stringify(session));
          navigate("/", { replace: true });
          return;
        }

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
