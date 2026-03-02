import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import UploadPage from "./UploadPage.jsx";
import SharePage from "./SharePage.jsx";
import PrivacyPolicyPage from "./PrivacyPolicyPage.jsx";
import TermsPage from "./TermsPage.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<UploadPage />} />
        <Route path="/share/:token" element={<SharePage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsPage />} />
      </Routes>
    </BrowserRouter>
  );
}
