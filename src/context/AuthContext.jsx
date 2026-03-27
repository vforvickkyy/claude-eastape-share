import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { userApi, authApi } from "../lib/api";

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
  const [user,    setUser]    = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  function applySession(session) {
    setUser(session?.user ?? null);
    saveSession(session ?? null);
    if (session?.access_token && session?.refresh_token) {
      supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      }).catch(() => {});
    } else if (!session) {
      supabase.auth.signOut().catch(() => {});
      setProfile(null);
    }
  }

  // Merge partial updates into profile state immediately (no refetch needed)
  function updateProfileLocally(updates) {
    setProfile(prev => prev ? { ...prev, ...updates } : updates);
  }

  async function fetchProfile() {
    try {
      const data = await userApi.getProfile();
      setProfile(data);
    } catch { /* profile stays null; pages that need it will handle gracefully */ }
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
        try {
          await supabase.auth.setSession({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          });
        } catch {}
        if (!cancelled) setLoading(false);
        if (!cancelled) fetchProfile();
      } else {
        try {
          const { session: newSession } = await apiPost("/api/auth/refresh", { refreshToken: session.refresh_token });
          if (!cancelled) { applySession(newSession); fetchProfile(); }
        } catch {
          if (!cancelled) { saveSession(null); setUser(null); }
        }
        if (!cancelled) setLoading(false);
      }
    }

    init();

    const interval = setInterval(() => {
      const current = loadSession();
      if (!current?.refresh_token) return;
      const expiresInSeconds = (current.expires_at || 0) - Date.now() / 1000;
      if (expiresInSeconds < 300) {
        apiPost("/api/auth/refresh", { refreshToken: current.refresh_token })
          .then(({ session: newSession }) => applySession(newSession))
          .catch(() => { saveSession(null); setUser(null); setProfile(null); });
      }
    }, 4 * 60 * 1000);

    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  async function login(email, password) {
    const { session } = await apiPost("/api/auth/login", { email, password });
    applySession(session);
    // Fetch profile after a brief tick so supabase.auth.setSession has fired
    setTimeout(fetchProfile, 200);
    return session;
  }

  async function signup(email, password, fullName) {
    // Returns { success, email, requiresVerification } — no session yet
    const result = await apiPost("/api/auth/signup", { email, password, fullName });
    return result;
  }

  async function verifyOTP(email, token) {
    const result = await authApi.verifyOTP(email, token);
    if (result.error) throw new Error(result.error);
    if (result.session) {
      applySession(result.session);
      setTimeout(fetchProfile, 200);
    }
    return result;
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
    setProfile(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, profile, setProfile, updateProfileLocally, login, signup, verifyOTP, logout, loginWithGoogle }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
