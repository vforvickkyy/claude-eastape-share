import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import UploadPage from "./UploadPage.jsx";
import SharePage from "./SharePage.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<UploadPage />} />
        <Route path="/share/:token" element={<SharePage />} />
      </Routes>
    </BrowserRouter>
  );
}
