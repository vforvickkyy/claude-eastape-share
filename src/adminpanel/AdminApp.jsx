import React, { lazy, Suspense, useState, useEffect } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import AdminLayout from "./AdminLayout";

/* ── Lazy page imports ──────────────────────────────────────── */
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminUsers     = lazy(() => import("./pages/AdminUsers"));
const AdminPlans     = lazy(() => import("./pages/AdminPlans"));
const AdminStorage   = lazy(() => import("./pages/AdminStorage"));
const AdminMedia     = lazy(() => import("./pages/AdminMedia"));
const AdminDatabase  = lazy(() => import("./pages/AdminDatabase"));
const AdminAnalytics = lazy(() => import("./pages/AdminAnalytics"));
const AdminAuditLogs = lazy(() => import("./pages/AdminAuditLogs"));
const AdminSettings  = lazy(() => import("./pages/AdminSettings"));
const AdminAdmins    = lazy(() => import("./pages/AdminAdmins"));

/* ── Env vars ───────────────────────────────────────────────── */
const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/* ── Full-page spinner ──────────────────────────────────────── */
function FullPageSpinner({ message = "Verifying admin access…" }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        gap: "16px",
        color: "var(--t3)",
        fontSize: "13px",
      }}
    >
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--admin-accent, #f97316)"
        strokeWidth="2"
        style={{ animation: "spin 0.8s linear infinite" }}
      >
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
      <span>{message}</span>
    </div>
  );
}

/* ── Page-level Suspense fallback ───────────────────────────── */
function PageLoader() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "300px",
        color: "var(--t3)",
        fontSize: "13px",
        gap: "10px",
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--admin-accent, #f97316)"
        strokeWidth="2"
        style={{ animation: "spin 0.8s linear infinite" }}
      >
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
      Loading…
    </div>
  );
}

/**
 * AdminApp — top-level admin panel component.
 *
 * On mount:
 *  1. Reads session from localStorage key "ets_auth"
 *  2. Fetches profile from Supabase REST to verify is_admin
 *  3. If not admin → redirects to /dashboard
 *  4. If admin    → renders AdminLayout with all admin routes
 */
export default function AdminApp() {
  const navigate = useNavigate();

  const [status, setStatus]         = useState("loading"); // "loading" | "authorized" | "denied"
  const [adminUser, setAdminUser]   = useState(null);

  useEffect(() => {
    async function checkAdmin() {
      try {
        /* 1. Read session from localStorage */
        const raw = localStorage.getItem("ets_auth");
        if (!raw) {
          setStatus("denied");
          navigate("/dashboard", { replace: true });
          return;
        }

        let session;
        try {
          session = JSON.parse(raw);
        } catch {
          setStatus("denied");
          navigate("/dashboard", { replace: true });
          return;
        }

        /* Support both flat session and nested {session: {...}} shapes */
        const sessionData = session?.session ?? session;
        const token       = sessionData?.access_token;
        const userId      = sessionData?.user?.id;

        if (!token || !userId) {
          setStatus("denied");
          navigate("/dashboard", { replace: true });
          return;
        }

        /* 2. Fetch profile from Supabase REST */
        const url = `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=id,full_name,avatar_url,is_admin`;

        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
          },
        });

        if (!res.ok) {
          console.error("Admin check fetch failed:", res.status, await res.text());
          setStatus("denied");
          navigate("/dashboard", { replace: true });
          return;
        }

        const profiles = await res.json();
        const profile  = Array.isArray(profiles) ? profiles[0] : profiles;

        /* 3. Check is_admin flag */
        if (!profile?.is_admin) {
          setStatus("denied");
          navigate("/dashboard", { replace: true });
          return;
        }

        /* 4. Authorized — store admin user data */
        setAdminUser({
          id:         profile.id,
          full_name:  profile.full_name,
          avatar_url: profile.avatar_url,
          is_admin:   true,
        });
        setStatus("authorized");
      } catch (err) {
        console.error("Admin check error:", err);
        setStatus("denied");
        navigate("/dashboard", { replace: true });
      }
    }

    checkAdmin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Show spinner while verifying */
  if (status === "loading") {
    return <FullPageSpinner />;
  }

  /* Denied — navigate already called, render nothing */
  if (status === "denied") {
    return null;
  }

  /* Authorized — render admin panel */
  return (
    <Routes>
      <Route element={<AdminLayout user={adminUser} />}>
        <Route
          index
          element={
            <Suspense fallback={<PageLoader />}>
              <AdminDashboard />
            </Suspense>
          }
        />
        <Route
          path="users"
          element={
            <Suspense fallback={<PageLoader />}>
              <AdminUsers />
            </Suspense>
          }
        />
        <Route
          path="plans"
          element={
            <Suspense fallback={<PageLoader />}>
              <AdminPlans />
            </Suspense>
          }
        />
        <Route
          path="storage"
          element={
            <Suspense fallback={<PageLoader />}>
              <AdminStorage />
            </Suspense>
          }
        />
        <Route
          path="media"
          element={
            <Suspense fallback={<PageLoader />}>
              <AdminMedia />
            </Suspense>
          }
        />
        <Route
          path="database"
          element={
            <Suspense fallback={<PageLoader />}>
              <AdminDatabase />
            </Suspense>
          }
        />
        <Route
          path="analytics"
          element={
            <Suspense fallback={<PageLoader />}>
              <AdminAnalytics />
            </Suspense>
          }
        />
        <Route
          path="audit"
          element={
            <Suspense fallback={<PageLoader />}>
              <AdminAuditLogs />
            </Suspense>
          }
        />
        <Route
          path="settings"
          element={
            <Suspense fallback={<PageLoader />}>
              <AdminSettings />
            </Suspense>
          }
        />
        <Route
          path="admins"
          element={
            <Suspense fallback={<PageLoader />}>
              <AdminAdmins />
            </Suspense>
          }
        />
      </Route>
    </Routes>
  );
}
