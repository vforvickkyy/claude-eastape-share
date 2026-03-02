import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  DownloadSimple, File, FileImage, FilePdf, FileZip, FileVideo, FileAudio,
  FileCode, ArrowLeft, CheckCircle, Copy, Warning,
} from "@phosphor-icons/react";

const API_BASE = import.meta.env.VITE_API_BASE || "";

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getFileIcon(name = "", size = 20) {
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
  const [status, setStatus]           = useState("loading");
  const [shareData, setShareData]     = useState(null);
  const [errorMsg, setErrorMsg]       = useState("");
  const [copied, setCopied]           = useState(false);
  const [downloading, setDownloading] = useState({});

  const shareLink = window.location.href;

  useEffect(() => {
    if (!token) return;
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/share/${token}`);
        if (res.status === 404) { setStatus("error");   setErrorMsg("Share not found. This link may be invalid."); return; }
        if (res.status === 410) { setStatus("expired"); setErrorMsg("This share link has expired after 7 days."); return; }
        if (!res.ok)            { setStatus("error");   setErrorMsg(`Server error (${res.status}). Please try again.`); return; }
        const data = await res.json();
        setShareData(data);
        setStatus("ready");
      } catch (err) {
        setStatus("error");
        setErrorMsg("Network error. Please check your connection.");
      }
    }
    load();
  }, [token]);

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
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || file.file_name;
      a.rel = "noopener noreferrer";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => document.body.removeChild(a), 1000);
    } catch (err) {
      alert(`Could not download "${file.file_name}".\n${err.message}`);
    } finally {
      setTimeout(() => setDownloading(d => ({ ...d, [file.id]: false })), 1500);
    }
  }

  function handleDownloadAll() {
    if (!shareData?.files) return;
    shareData.files.forEach((file, idx) => setTimeout(() => handleDownload(file), idx * 600));
  }

  function copyLink() {
    navigator.clipboard.writeText(shareLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const totalSize = shareData?.files?.reduce((s, f) => s + (f.file_size || 0), 0) || 0;

  return (
    <div className="page page-share">
      <div className="noise" />

      <header className="site-header">
        <LogoSlot />
        <div className="header-right">
          <Link to="/" className="back-link">
            <ArrowLeft size={13} weight="bold" /> Upload More
          </Link>
        </div>
      </header>

      {/* Two-column layout — same grid as upload page */}
      <main className="share-main-layout">

        {/* LEFT — hero text */}
        <motion.section className="share-hero"
          initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        >
          {status === "ready" ? (
            <>
              <h1 className="share-hero-title">
                Files Ready<br />
                <span className="share-hero-accent">For Download</span>
              </h1>
              <p className="share-hero-desc">Your files are available. Click download to save them.</p>
            </>
          ) : status === "loading" ? (
            <h1 className="share-hero-title">
              Loading<br />
              <span className="share-hero-accent">Your Files</span>
            </h1>
          ) : (
            <h1 className="share-hero-title">
              Link<br />
              <span className="share-hero-accent">Not Found</span>
            </h1>
          )}
        </motion.section>

        {/* RIGHT — glass card */}
        <motion.section className="share-card-col"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        >
          <AnimatePresence mode="wait">

            {/* Loading */}
            {status === "loading" && (
              <motion.div key="loading" className="share-glass-card share-glass-center"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              >
                <div className="loading-wrap">
                  <span className="spinner spinner-lg" />
                  <p>Loading files…</p>
                </div>
              </motion.div>
            )}

            {/* Error / Expired */}
            {(status === "error" || status === "expired") && (
              <motion.div key="error" className="share-glass-card"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              >
                <div className="not-found">
                  <Warning size={38} weight="thin" style={{ color: "var(--t3)" }} />
                  <h2>{status === "expired" ? "Link Expired" : "Not Found"}</h2>
                  <p>{errorMsg}</p>
                  <Link to="/" className="upload-btn not-found-btn">Upload a new file</Link>
                </div>
              </motion.div>
            )}

            {/* Ready */}
            {status === "ready" && shareData && (
              <motion.div key="ready" className="share-glass-card"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ duration: 0.35 }}
              >
                <p className="share-card-inner-title">Your files are ready</p>

                {/* File list */}
                <div className="share-file-list">
                  {shareData.files.map((file, idx) => (
                    <motion.div key={file.id} className="share-file-item"
                      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.05 + idx * 0.05 }}
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
                        whileHover={!downloading[file.id] ? { scale: 1.1 } : {}}
                        whileTap={!downloading[file.id] ? { scale: 0.92 } : {}}
                        title={`Download ${file.file_name}`}
                      >
                        {downloading[file.id]
                          ? <span className="spinner spinner-sm" />
                          : <DownloadSimple size={16} weight="bold" />
                        }
                      </motion.button>
                    </motion.div>
                  ))}
                </div>

                {/* Total size */}
                <div className="total-size-row">
                  Total size: <strong>{formatSize(totalSize)}</strong>
                </div>

                {/* Download All */}
                {shareData.files.length > 1 && (
                  <motion.button className="upload-btn"
                    onClick={handleDownloadAll}
                    whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                  >
                    <DownloadSimple size={16} weight="bold" />
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
                      {copied ? <CheckCircle size={14} weight="fill" /> : <Copy size={14} />}
                      {copied ? "Copied!" : "Copy"}
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>
      </main>

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