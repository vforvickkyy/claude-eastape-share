import React, { lazy, Suspense, useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { PlanProvider } from "./context/PlanContext";
import UploadPage          from "./UploadPage.jsx";
import SharePage           from "./SharePage.jsx";
import LoginPage           from "./LoginPage.jsx";
import SignupPage          from "./SignupPage.jsx";
import PrivacyPolicyPage   from "./PrivacyPolicyPage.jsx";
import TermsPage           from "./TermsPage.jsx";
import DashboardPage       from "./DashboardPage.jsx";
import DrivePage           from "./DrivePage.jsx";
import RecentPage          from "./RecentPage.jsx";
import TrashPage           from "./TrashPage.jsx";
import ProfilePage         from "./ProfilePage.jsx";
import PricingPage         from "./PricingPage.jsx";
import MediaProjectsPage   from "./MediaProjectsPage.jsx";
import MediaProjectView    from "./MediaProjectView.jsx";
import MediaAssetPage      from "./MediaAssetPage.jsx";
import MediaSharePage      from "./MediaSharePage.jsx";
import AuthCallbackPage    from "./AuthCallbackPage.jsx";
import MediaRecentPage     from "./MediaRecentPage.jsx";
import MediaSharedPage     from "./MediaSharedPage.jsx";
import MaintenancePage     from "./MaintenancePage.jsx";

const AdminApp = lazy(() => import("./adminpanel/AdminApp.jsx"));

export default function App() {
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [maintenanceMessage, setMaintenanceMessage] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
    const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
    const session = JSON.parse(localStorage.getItem('ets_auth') || '{}')

    Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/platform_settings?key=eq.maintenance_mode&select=value`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token || ''}` }
      }).then(r => r.json()),
      fetch(`${SUPABASE_URL}/rest/v1/platform_settings?key=eq.maintenance_message&select=value`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token || ''}` }
      }).then(r => r.json()),
      session.user?.id ? fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${session.user.id}&select=is_admin`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}` }
      }).then(r => r.json()) : Promise.resolve([])
    ]).then(([modeData, msgData, profileData]) => {
      const mode = modeData?.[0]?.value === 'true'
      const msg = msgData?.[0]?.value || ''
      const adminFlag = profileData?.[0]?.is_admin === true
      setMaintenanceMode(mode)
      setMaintenanceMessage(msg)
      setIsAdmin(adminFlag)
    }).catch(() => {})
  }, [])

  if (maintenanceMode && !isAdmin) {
    return <MaintenancePage message={maintenanceMessage} />
  }

  return (
    <BrowserRouter>
      <AuthProvider>
      <PlanProvider>
        <Routes>
          {/* ── Root = Master Dashboard ── */}
          <Route path="/"                         element={<DashboardPage />} />
          <Route path="/dashboard"                element={<Navigate to="/" replace />} />

          {/* ── Drive (renamed My Files) ── */}
          <Route path="/drive"                    element={<DrivePage />} />
          <Route path="/drive/folder/:id"         element={<DrivePage />} />

          {/* ── Legacy redirects ── */}
          <Route path="/my-files"                 element={<Navigate to="/drive" replace />} />
          <Route path="/my-files/folder/:id"      element={<Navigate to="/drive" replace />} />

          {/* ── Upload (still accessible) ── */}
          <Route path="/upload"                   element={<UploadPage />} />

          {/* ── Media ── */}
          <Route path="/media"                    element={<MediaProjectsPage />} />
          <Route path="/media/project/:id"        element={<MediaProjectView />} />
          <Route path="/media/project/:id/folder/:folderId" element={<MediaProjectView />} />
          <Route path="/media/asset/:id"          element={<MediaAssetPage />} />
          <Route path="/media/share/:token"       element={<MediaSharePage />} />
          <Route path="/media/recent"             element={<MediaRecentPage />} />
          <Route path="/media/shared"             element={<MediaSharedPage />} />

          {/* ── Other ── */}
          <Route path="/share/:token"             element={<SharePage />} />
          <Route path="/login"                    element={<LoginPage />} />
          <Route path="/signup"                   element={<SignupPage />} />
          <Route path="/privacy"                  element={<PrivacyPolicyPage />} />
          <Route path="/terms"                    element={<TermsPage />} />
          <Route path="/recent"                   element={<RecentPage />} />
          <Route path="/trash"                    element={<TrashPage />} />
          <Route path="/profile"                  element={<ProfilePage />} />
          <Route path="/pricing"                  element={<PricingPage />} />
          <Route path="/plans"                    element={<PricingPage inDashboard />} />
          <Route path="/auth/callback"            element={<AuthCallbackPage />} />

          {/* ── Admin Panel ── */}
          <Route
            path="/adminpanel/*"
            element={
              <Suspense fallback={null}>
                <AdminApp />
              </Suspense>
            }
          />
        </Routes>
      </PlanProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
