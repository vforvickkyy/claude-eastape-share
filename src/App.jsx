import React, { lazy, Suspense, useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { PlanProvider } from "./context/PlanContext";
import { ProjectProvider } from "./context/ProjectContext";
import { UploadProvider } from "./context/UploadContext";
import UploadProgressPanel from "./components/drive/UploadProgressPanel";
import SharePage           from "./SharePage.jsx";
import LoginPage           from "./LoginPage.jsx";
import SignupPage          from "./SignupPage.jsx";
import OTPVerificationPage from "./OTPVerificationPage.jsx";
import PrivacyPolicyPage   from "./PrivacyPolicyPage.jsx";
import TermsPage           from "./TermsPage.jsx";
import DashboardPage       from "./DashboardPage.jsx";
import DrivePage           from "./DrivePage.jsx";
import RecentPage          from "./RecentPage.jsx";
import TrashPage           from "./TrashPage.jsx";
import ProfilePage         from "./ProfilePage.jsx";
import PricingPage         from "./PricingPage.jsx";
import MediaSharePage      from "./MediaSharePage.jsx";
import AuthCallbackPage    from "./AuthCallbackPage.jsx";
import MaintenancePage     from "./MaintenancePage.jsx";
import ProjectsPage        from "./ProjectsPage.jsx";
import ProjectPage         from "./ProjectPage.jsx";
import ProjectMediaAssetPage from "./ProjectMediaAssetPage.jsx";
import ProtectedRoute        from "./components/auth/ProtectedRoute.jsx";

const AdminApp       = lazy(() => import("./adminpanel/AdminApp.jsx"));
const OnboardingPage = lazy(() => import("./OnboardingPage.jsx"));

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
      <UploadProvider>
        <UploadProgressPanel />
        <Routes>
          {/* ── Root = Master Dashboard ── */}
          <Route path="/"                         element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/dashboard"                element={<Navigate to="/" replace />} />

          {/* ── Drive ── */}
          <Route path="/drive"                    element={<ProtectedRoute><DrivePage /></ProtectedRoute>} />
          <Route path="/drive/folder/:id"         element={<ProtectedRoute><DrivePage /></ProtectedRoute>} />

          {/* ── Projects ── */}
          <Route path="/projects"                 element={<ProtectedRoute><ProjectsPage /></ProtectedRoute>} />
          <Route
            path="/projects/:id/*"
            element={
              <ProtectedRoute>
                <ProjectProvider>
                  <ProjectPage />
                </ProjectProvider>
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:id/media/:mediaId"
            element={
              <ProtectedRoute>
                <ProjectProvider>
                  <ProjectMediaAssetPage />
                </ProjectProvider>
              </ProtectedRoute>
            }
          />

          {/* ── Legacy media redirects ── */}
          <Route path="/media"                    element={<Navigate to="/projects" replace />} />
          <Route path="/media/project/:id"        element={<LegacyProjectRedirect />} />
          <Route path="/media/asset/:id"          element={<Navigate to="/projects" replace />} />
          <Route path="/media/share/:token"       element={<MediaSharePage />} />
          <Route path="/media/recent"             element={<Navigate to="/projects" replace />} />
          <Route path="/media/shared"             element={<Navigate to="/projects" replace />} />

          {/* ── Legacy my-files redirects ── */}
          <Route path="/my-files"                 element={<Navigate to="/drive" replace />} />
          <Route path="/my-files/folder/:id"      element={<Navigate to="/drive" replace />} />

          {/* ── Upload → redirect to Drive ── */}
          <Route path="/upload"                   element={<Navigate to="/drive" replace />} />

          {/* ── Public share pages ── */}
          <Route path="/share/:token"             element={<SharePage />} />

          {/* ── Onboarding ── */}
          <Route path="/onboarding" element={
            <ProtectedRoute>
              <Suspense fallback={null}><OnboardingPage /></Suspense>
            </ProtectedRoute>
          } />

          {/* ── Auth ── */}
          <Route path="/login"                    element={<LoginPage />} />
          <Route path="/signup"                   element={<SignupPage />} />
          <Route path="/verify-otp"               element={<OTPVerificationPage />} />
          <Route path="/auth/callback"            element={<AuthCallbackPage />} />

          {/* ── Static / misc ── */}
          <Route path="/privacy"                  element={<PrivacyPolicyPage />} />
          <Route path="/terms"                    element={<TermsPage />} />
          <Route path="/recent"                   element={<ProtectedRoute><RecentPage /></ProtectedRoute>} />
          <Route path="/trash"                    element={<ProtectedRoute><TrashPage /></ProtectedRoute>} />
          <Route path="/profile"                  element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/pricing"                  element={<PricingPage />} />
          <Route path="/plans"                    element={<ProtectedRoute><PricingPage inDashboard /></ProtectedRoute>} />

          {/* ── Admin Panel ── */}
          <Route
            path="/adminpanel/*"
            element={
              <ProtectedRoute>
                <Suspense fallback={null}>
                  <AdminApp />
                </Suspense>
              </ProtectedRoute>
            }
          />
        </Routes>
      </UploadProvider>
      </PlanProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

function LegacyProjectRedirect() {
  const { id } = useParams()
  return <Navigate to={`/projects/${id}`} replace />
}
