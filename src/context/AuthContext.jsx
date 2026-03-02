import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext(null);

// Race any Supabase promise against a hard timeout so the UI never hangs forever
function withTimeout(promise, ms = 10000) {
  const timer = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error("Connection timed out. Make sure your Supabase project is not paused (Supabase Dashboard → Resume Project).")),
      ms
    )
  );
  return Promise.race([promise, timer]);
}

// Turn a raw "Failed to fetch" into something actionable
function friendlyError(err) {
  if (err?.message === "Failed to fetch") {
    return new Error(
      "Cannot reach Supabase. Fix checklist:\n" +
      "1. VITE_SUPABASE_URL must be https://[id].supabase.co (include https://)\n" +
      "2. Supabase project may be paused — go to supabase.com and resume it\n" +
      "3. Add https://claude-eastape-share.vercel.app to Supabase → Auth → URL Configuration"
    );
  }
  return err;
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    withTimeout(supabase.auth.getSession(), 8000)
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null);
      })
      .catch(() => {
        // Session check timed out or failed — treat as logged out
        setUser(null);
      })
      .finally(() => setLoading(false));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function login(email, password) {
    if (!supabase) throw new Error("Auth is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your Vercel environment variables.");
    try {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password })
      );
      if (error) throw error;
      return data;
    } catch (err) {
      throw friendlyError(err);
    }
  }

  async function signup(email, password, fullName) {
    if (!supabase) throw new Error("Auth is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your Vercel environment variables.");
    try {
      const { data, error } = await withTimeout(
        supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        })
      );
      if (error) throw error;
      return data;
    } catch (err) {
      throw friendlyError(err);
    }
  }

  async function logout() {
    if (!supabase) return;
    await withTimeout(supabase.auth.signOut(), 5000).catch(() => {});
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
