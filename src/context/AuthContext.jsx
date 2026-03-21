import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Auth is handled via Supabase Edge Functions.
// Sessions are stored in localStorage so they survive page reloads.

const SESSION_KEY = "ets_auth";
const AuthContext = createContext(null);

function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}
function saveSession(session) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}
function isExpired(session) {
  // expires_at is a Unix timestamp in seconds
  return !session?.expires_at || Date.now() / 1000 > session.expires_at - 30;
}

const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

const AUTH_PATHS = {
  "/api/auth/login":   `${EDGE_BASE}/auth-login`,
  "/api/auth/signup":  `${EDGE_BASE}/auth-signup`,
  "/api/auth/refresh": `${EDGE_BASE}/auth-refresh`,
};

async function apiPost(path, body) {
  const url = AUTH_PATHS[path] || path;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  function applySession(session) {
    setUser(session?.user ?? null);
    saveSession(session ?? null);
    // Sync to Supabase native so supabase.auth.getSession() works for all users.
    // Critical for email/password users whose session was created server-side.
    if (session?.access_token && session?.refresh_token) {
      supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      }).catch(() => {});
    } else if (!session) {
      supabase.auth.signOut().catch(() => {});
    }
  }

  // Restore session on mount + proactive auto-refresh
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const session = loadSession();
      if (!session) {
        if (!cancelled) setLoading(false);
        return;
      }

      if (!isExpired(session)) {
        if (!cancelled) setUser(session.user);
        // AWAIT setSession so supabase.auth.getSession() is populated before
        // any child component mounts and calls getToken(). Without awaiting,
        // components mount immediately and getSession() returns null → 401.
        try {
          await supabase.auth.setSession({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          });
        } catch {}
        if (!cancelled) setLoading(false);
      } else {
        // Session expired on load — try to refresh silently
        try {
          const { session: newSession } = await apiPost("/api/auth/refresh", { refreshToken: session.refresh_token });
          if (!cancelled) applySession(newSession);
        } catch {
          if (!cancelled) { saveSession(null); setUser(null); }
        }
        if (!cancelled) setLoading(false);
      }
    }

    init();

    // Check every 4 minutes; refresh if token expires within 5 minutes
    const interval = setInterval(() => {
      const current = loadSession();
      if (!current?.refresh_token) return;
      const expiresInSeconds = (current.expires_at || 0) - Date.now() / 1000;
      if (expiresInSeconds < 300) {
        apiPost("/api/auth/refresh", { refreshToken: current.refresh_token })
          .then(({ session: newSession }) => applySession(newSession))
          .catch(() => { saveSession(null); setUser(null); });
      }
    }, 4 * 60 * 1000);

    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  async function login(email, password) {
    const { session } = await apiPost("/api/auth/login", { email, password });
    applySession(session);
    return session;
  }

  async function signup(email, password, fullName) {
    const { session } = await apiPost("/api/auth/signup", { email, password, fullName });
    applySession(session);
    return session;
  }

  async function loginWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { access_type: "offline", prompt: "consent" },
        skipBrowserRedirect: false,
      },
    });
    if (error) throw error;
  }

  function logout() {
    saveSession(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, loginWithGoogle }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
