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
const ANON_KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY;

const AUTH_PATHS = {
  "/api/auth/login":   `${EDGE_BASE}/auth-login`,
  "/api/auth/signup":  `${EDGE_BASE}/auth-signup`,
  "/api/auth/refresh": `${EDGE_BASE}/auth-refresh`,
};

// Auth endpoints are called before the user has a session, so we send the
// public anon key as the Bearer token so the Supabase gateway lets the
// request through to the function code (without it the gateway returns 401
// before our function runs, resulting in a generic "Request failed" error).
async function apiPost(path, body) {
  const url = AUTH_PATHS[path] || path;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ANON_KEY}`,
      "apikey": ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || "Request failed");
  return data;
}

export function AuthProvider({ children }) {
  const [user,            setUser]            = useState(null);
  const [profile,         setProfile]         = useState(null);
  const [loading,         setLoading]         = useState(true);
  const [unverifiedEmail, setUnverifiedEmail] = useState(null);

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
        // SECURITY: reject any stored session where email was never confirmed
        if (!session.user?.email_confirmed_at) {
          saveSession(null);
          if (!cancelled) { setUnverifiedEmail(session.user?.email ?? null); setLoading(false); }
          return;
        }
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

    // Listen for Supabase auth events (Google OAuth callback writes session via supabase.auth)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'SIGNED_OUT') {
        saveSession(null);
        setUser(null);
        setProfile(null);
        return;
      }
      if (session?.user) {
        // Only update if we don't already have this user (avoids overwriting richer session)
        setUser(prev => {
          if (!prev || prev.id !== session.user.id) {
            saveSession(session);
            return session.user;
          }
          return prev;
        });
        fetchProfile();
      }
    });

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

    return () => { cancelled = true; clearInterval(interval); subscription?.unsubscribe?.(); };
  }, []);

  async function login(email, password) {
    const result = await apiPost("/api/auth/login", { email, password });
    // Unverified user — do not create a session; send them to OTP page
    if (result.requiresVerification) {
      setUnverifiedEmail(result.email);
      return result;
    }
    applySession(result.session);
    // Fetch profile after a brief tick so supabase.auth.setSession has fired
    setTimeout(fetchProfile, 200);
    return result;
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
    supabase.auth.signOut().catch(() => {});
  }

  return (
    <AuthContext.Provider value={{ user, loading, profile, unverifiedEmail, setProfile, updateProfileLocally, login, signup, verifyOTP, logout, loginWithGoogle }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
