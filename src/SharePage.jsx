import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  DownloadSimple, File, FileImage, FilePdf, FileZip, FileVideo, FileAudio,
  FileCode, ArrowLeft, CheckCircle, Copy, Warning, CalendarBlank,
} from "@phosphor-icons/react";

/* ─── config ─── */
const API_BASE = import.meta.env.VITE_API_BASE || "";

/* ─── helpers ─── */
function formatSize(bytes) {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getFileIcon(name = "", size = 26) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (["jpg","jpeg","png","gif","webp","svg"].includes(ext)) return <FileImage size={size} weight="duotone" />;
  if (ext === "pdf") return <FilePdf size={size} weight="duotone" />;
  if (["zip","rar","7z","tar","gz"].includes(ext)) return <FileZip size={size} weight="duotone" />;
  if (["mp4","mov","avi","mkv","webm"].includes(ext)) return <FileVideo size={size} weight="duotone" />;
  if (["mp3","wav","ogg","flac","aac"].includes(ext)) return <FileAudio size={size} weight="duotone" />;
  if (["js","ts","jsx","tsx","py","go","rs","html","css"].includes(ext)) return <FileCode size={size} weight="duotone" />;
  return <File size={size} weight="duotone" />;
}

export default function SharePage() {
  const { token } = useParams();

  const [status, setStatus]       = useState("loading");
  const [shareData, setShareData] = useState(null);
  const [errorMsg, setErrorMsg]   = useState("");
  const [copied, setCopied]       = useState(false);
  const [downloading, setDownloading] = useState({}); // { fileId: true }

  const shareLink = window.location.href;

  /* ─── Load share metadata ─── */
  useEffect(() => {
    if (!token) return;
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/share/${token}`);
        if (res.status === 404) { setStatus("error");   setErrorMsg("Share not found. The link may be invalid or was never created."); return; }
        if (res.status === 410) { setStatus("expired"); setErrorMsg("This share link has expired after 7 days."); return; }
        if (!res.ok)            { setStatus("error");   setErrorMsg(`Server error (${res.status}). Please try again.`); return; }
        const data = await res.json();
        setShareData(data);
        setStatus("ready");
      } catch (err) {
        console.error("loadShare:", err);
        setStatus("error");
        setErrorMsg("Network error. Please check your connection and try again.");
      }
    }
    load();
  }, [token]);

  /* ─── Download a file ─────────────────────────────────────────────────────
   * Flow:
   *  1. Call GET /api/download?token=&fileId= → server returns { url, fileName }
   *  2. Set window.location.href = url → browser downloads directly from Wasabi
   *     This is the only reliable cross-browser way to trigger a download from
   *     a third-party URL without opening a new tab or hitting CORS issues.
   ─────────────────────────────────────────────────────────────────────────── */
  async function handleDownload(file) {
    if (downloading[file.id]) return;
    setDownloading(d => ({ ...d, [file.id]: true }));

    try {
      const res = await fetch(
        `${API_BASE}/api/download?token=${encodeURIComponent(token)}&fileId=${encodeURIComponent(file.id)}`
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error (${res.status})`);
      }

      const { url, fileName } = await res.json();

      // Use a hidden anchor with the download attribute.
      // Setting window.location.href would navigate away so we use this method instead.
      // The presigned URL has Content-Disposition: attachment baked in, so the browser
      // downloads immediately without opening a preview.
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || file.file_name; // hint for filename
      a.rel = "noopener noreferrer";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      // Small delay before removing so the browser has time to initiate
      setTimeout(() => document.body.removeChild(a), 1000);
    } catch (err) {
      console.error("Download error:", err);
      alert(`Could not download "${file.file_name}".\n${err.message}`);
    } finally {
      // Keep spinner briefly so user sees feedback
      setTimeout(() => setDownloading(d => ({ ...d, [file.id]: false })), 1500);
    }
  }

  function handleDownloadAll() {
    if (!shareData?.files) return;
    shareData.files.forEach((file, idx) => {
      setTimeout(() => handleDownload(file), idx * 600);
    });
  }

  function copyLink() {
    navigator.clipboard.writeText(shareLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="page page-share">
      <div className="noise" />

      {/* Header */}
      <header className="site-header">
        <LogoSlot />
        <Link to="/" className="back-link">
          <ArrowLeft size={14} weight="bold" /> Upload files
        </Link>
      </header>

      <main className="share-main">
        <AnimatePresence mode="wait">

          {/* Loading */}
          {status === "loading" && (
            <motion.div key="loading" className="share-card share-card-center"
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            >
              <div className="loading-wrap">
                <span className="spinner spinner-lg" />
                <p>Loading files…</p>
              </div>
            </motion.div>
          )}

          {/* Error / expired */}
          {(status === "error" || status === "expired") && (
            <motion.div key="error" className="share-card"
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            >
              <div className="not-found">
                <Warning size={44} weight="thin" style={{ color: "var(--t3)" }} />
                <h2>{status === "expired" ? "Link Expired" : "Not Found"}</h2>
                <p>{errorMsg}</p>
                <Link to="/" className="upload-btn not-found-btn">Upload a new file</Link>
              </div>
            </motion.div>
          )}

          {/* Ready */}
          {status === "ready" && shareData && (
            <motion.div key="ready" className="share-card"
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: [0.22,1,0.36,1] }}
            >
              {/* Header */}
              <div className="share-card-header">
                <p className="share-card-label">
                  <CheckCircle size={15} weight="fill" className="share-check" />
                  {shareData.files.length} file{shareData.files.length !== 1 ? "s" : ""} ready to download
                </p>
                <h2 className="share-card-title">Shared Files</h2>
                {shareData.expires_at && (
                  <p className="share-expires">
                    <CalendarBlank size={12} />
                    Expires {formatDate(shareData.expires_at)}
                  </p>
                )}
              </div>

              {/* File list */}
              <div className="share-file-list">
                {shareData.files.map((file, idx) => (
                  <motion.div key={file.id} className="share-file-item"
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.06 + idx * 0.06 }}
                  >
                    <span className="share-file-icon">{getFileIcon(file.file_name)}</span>
                    <div className="share-file-info">
                      <span className="file-name">{file.file_name}</span>
                      <span className="file-size">{formatSize(file.file_size)}</span>
                    </div>
                    <motion.button
                      className={`download-btn ${downloading[file.id] ? "downloading" : ""}`}
                      onClick={() => handleDownload(file)}
                      disabled={!!downloading[file.id]}
                      whileHover={!downloading[file.id] ? { scale: 1.08 } : {}}
                      whileTap={!downloading[file.id] ? { scale: 0.92 } : {}}
                      title={`Download ${file.file_name}`}
                    >
                      {downloading[file.id]
                        ? <span className="spinner spinner-sm" />
                        : <DownloadSimple size={17} weight="bold" />
                      }
                    </motion.button>
                  </motion.div>
                ))}
              </div>

              {/* Download All */}
              {shareData.files.length > 1 && (
                <motion.button className="upload-btn download-all-btn"
                  onClick={handleDownloadAll}
                  whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                >
                  <DownloadSimple size={17} weight="bold" />
                  Download All ({shareData.files.length} files)
                </motion.button>
              )}

              {/* Copy link */}
              <div className="share-copy-row">
                <p className="share-copy-label">Share this link</p>
                <div className="share-row">
                  <input readOnly value={shareLink} className="share-input" onFocus={e => e.target.select()} />
                  <motion.button className={`copy-btn ${copied ? "copied" : ""}`} onClick={copyLink}
                    whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                  >
                    {copied ? <CheckCircle size={15} weight="fill" /> : <Copy size={15} />}
                    {copied ? "Copied!" : "Copy"}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="site-footer">
        <span>© {new Date().getFullYear()} Eastape Films. All rights reserved.</span>
        <span>Currently for Private use only</span>
      </footer>
    </div>
  );
}

function LogoSlot() {
  const [hasLogo, setHasLogo] = React.useState(true);
  return hasLogo ? (
    <img src="/logo.png" alt="Eastape Share" className="logo-img" onError={() => setHasLogo(false)} />
  ) : (
    <div className="logo-text-fallback">
      <span className="logo-dot" />
      Eastape Share
    </div>
  );
}
