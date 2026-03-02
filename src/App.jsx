import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import UploadPage from "./UploadPage.jsx";
import SharePage from "./SharePage.jsx";
import LoginPage from "./LoginPage.jsx";
import SignupPage from "./SignupPage.jsx";
import PrivacyPolicyPage from "./PrivacyPolicyPage.jsx";
import TermsPage from "./TermsPage.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/"              element={<UploadPage />} />
          <Route path="/share/:token"  element={<SharePage />} />
          <Route path="/login"         element={<LoginPage />} />
          <Route path="/signup"        element={<SignupPage />} />
          <Route path="/privacy"       element={<PrivacyPolicyPage />} />
          <Route path="/terms"         element={<TermsPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
