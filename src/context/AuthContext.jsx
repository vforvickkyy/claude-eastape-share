import { createContext, useContext, useEffect, useState } from "react";

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
  }

  // Restore session on mount
  useEffect(() => {
    const session = loadSession();
    if (!session) { setLoading(false); return; }

    if (!isExpired(session)) {
      setUser(session.user);
      setLoading(false);
      return;
    }

    // Session expired — try to refresh silently
    apiPost("/api/auth/refresh", { refreshToken: session.refresh_token })
      .then(({ session: newSession }) => applySession(newSession))
      .catch(() => { saveSession(null); setUser(null); })
      .finally(() => setLoading(false));
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

  function logout() {
    saveSession(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
