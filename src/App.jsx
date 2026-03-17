import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
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
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
