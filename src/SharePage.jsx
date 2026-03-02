import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  DownloadSimple, File, FileImage, FilePdf, FileZip, FileVideo, FileAudio,
  FileCode, Lightning, ArrowLeft, CheckCircle, Copy, Warning, Spinner,
  CalendarBlank,
} from "@phosphor-icons/react";

/* ─── config ──────────────────────────────────────── */
const API_BASE = import.meta.env.VITE_API_BASE || "";

/* ─── helpers ─────────────────────────────────────── */
function formatSize(bytes) {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

/* ─── component ───────────────────────────────────── */
export default function SharePage() {
  const { token } = useParams();

  const [status, setStatus]     = useState("loading"); // loading | ready | error | expired
  const [shareData, setShareData] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const [copied, setCopied]             = useState(false);
  const [downloading, setDownloading]   = useState({}); // { fileId: true }

  const shareLink = window.location.href;

  /* ─── Fetch share metadata ─── */
  useEffect(() => {
    if (!token) return;

    async function loadShare() {
      try {
        const res = await fetch(`${API_BASE}/api/share/${token}`);
        if (res.status === 404) { setStatus("error");   setErrorMsg("Share not found. The link may be invalid."); return; }
        if (res.status === 410) { setStatus("expired"); setErrorMsg("This share link has expired."); return; }
        if (!res.ok)             { setStatus("error");   setErrorMsg("Failed to load share. Please try again."); return; }
        const data = await res.json();
        setShareData(data);
        setStatus("ready");
      } catch (err) {
        console.error("loadShare error:", err);
        setStatus("error");
        setErrorMsg("Network error. Please check your connection.");
      }
    }

    loadShare();
  }, [token]);

  /* ─── Download a single file ───────────────────────
   * We call GET /api/download?token=xxx&fileId=yyy
   * The server responds with a 302 redirect to a fresh
   * presigned Wasabi GET URL that has Content-Disposition: attachment.
   * We create a hidden <a> and programmatically click it so the browser
   * downloads without opening a new tab.
   */
  async function handleDownload(file) {
    if (downloading[file.id]) return;
    setDownloading((d) => ({ ...d, [file.id]: true }));

    try {
      // Build the download URL — the server will 302 to Wasabi
      const downloadUrl = `${API_BASE}/api/download?token=${encodeURIComponent(token)}&fileId=${encodeURIComponent(file.id)}`;

      // Fetch the URL so we can follow the redirect and get the final Wasabi URL
      const res = await fetch(downloadUrl, { redirect: "follow" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Get the blob (this is the actual file from Wasabi)
      const blob = await res.blob();

      // Create a temporary object URL and click it — forces browser download
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = file.file_name;   // forces download with original filename
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Revoke the object URL after a brief delay
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
    } catch (err) {
      console.error("Download error:", err);
      alert(`Download failed for "${file.file_name}". Please try again.`);
    } finally {
      setDownloading((d) => ({ ...d, [file.id]: false }));
    }
  }

  function handleDownloadAll() {
    if (!shareData?.files) return;
    // Stagger downloads slightly so browsers don't block them as popups
    shareData.files.forEach((file, idx) => {
      setTimeout(() => handleDownload(file), idx * 300);
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
      <div className="orb orb-1" /><div className="orb orb-2" /><div className="orb orb-3" />

      <header className="site-header">
        <div className="logo">
          <span className="logo-icon"><Lightning size={18} weight="fill" /></span>
          Eastape Share
        </div>
        <Link to="/" className="back-link">
          <ArrowLeft size={15} weight="bold" /> Upload files
        </Link>
      </header>

      <main className="share-main">
        <AnimatePresence mode="wait">

          {/* Loading */}
          {status === "loading" && (
            <motion.div key="loading" className="share-card share-card-center"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            >
              <div className="loading-wrap">
                <span className="spinner spinner-lg" />
                <p>Loading share…</p>
              </div>
            </motion.div>
          )}

          {/* Error / expired */}
          {(status === "error" || status === "expired") && (
            <motion.div key="error" className="share-card"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            >
              <div className="not-found">
                <div className="not-found-icon-wrap">
                  <Warning size={40} weight="thin" />
                </div>
                <h2>{status === "expired" ? "Link Expired" : "Not Found"}</h2>
                <p>{errorMsg}</p>
                <Link to="/" className="upload-btn not-found-btn">
                  Upload a new file
                </Link>
              </div>
            </motion.div>
          )}

          {/* Ready */}
          {status === "ready" && shareData && (
            <motion.div key="ready" className="share-card"
              initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Header */}
              <div className="share-card-header">
                <p className="share-card-label">
                  <CheckCircle size={16} weight="fill" className="share-check" />
                  {shareData.files.length} file{shareData.files.length !== 1 ? "s" : ""} ready to download
                </p>
                <h2 className="share-card-title">Shared Files</h2>
                {shareData.expires_at && (
                  <p className="share-expires">
                    <CalendarBlank size={13} weight="regular" />
                    Expires {formatDate(shareData.expires_at)}
                  </p>
                )}
              </div>

              {/* File list */}
              <div className="share-file-list">
                {shareData.files.map((file, idx) => (
                  <motion.div key={file.id} className="share-file-item"
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 + idx * 0.06 }}
                  >
                    <span className="share-file-icon">{getFileIcon(file.file_name, 26)}</span>
                    <div className="share-file-info">
                      <span className="file-name">{file.file_name}</span>
                      <span className="file-size">{formatSize(file.file_size)}</span>
                    </div>
                    <motion.button
                      className={`download-btn ${downloading[file.id] ? "downloading" : ""}`}
                      onClick={() => handleDownload(file)}
                      disabled={downloading[file.id]}
                      whileHover={!downloading[file.id] ? { scale: 1.08 } : {}}
                      whileTap={!downloading[file.id] ? { scale: 0.93 } : {}}
                      title="Download"
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
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                >
                  <DownloadSimple size={18} weight="bold" />
                  Download All ({shareData.files.length} files)
                </motion.button>
              )}

              {/* Copy share link */}
              <div className="share-copy-row">
                <p className="share-copy-label">Share this link</p>
                <div className="share-row">
                  <input readOnly value={shareLink} className="share-input" onFocus={(e) => e.target.select()} />
                  <motion.button className={`copy-btn ${copied ? "copied" : ""}`} onClick={copyLink}
                    whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.96 }}
                  >
                    {copied ? <CheckCircle size={16} weight="fill" /> : <Copy size={16} />}
                    {copied ? "Copied!" : "Copy"}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
