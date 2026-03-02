import React, { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  CloudArrowUp, File, FileImage, FilePdf, FileZip, FileVideo, FileAudio,
  FileCode, X, Copy, CheckCircle, ArrowRight, Warning,
} from "@phosphor-icons/react";

/* ─── config ─── */
const API_BASE = import.meta.env.VITE_API_BASE || "";

/* ─── helpers ─── */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatSpeed(bytesPerSec) {
  if (bytesPerSec < 1024) return `${bytesPerSec} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

function formatEta(seconds) {
  if (!isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function getFileIcon(name, size = 20) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (["jpg","jpeg","png","gif","webp","svg"].includes(ext)) return <FileImage size={size} weight="duotone" />;
  if (ext === "pdf") return <FilePdf size={size} weight="duotone" />;
  if (["zip","rar","7z","tar","gz"].includes(ext)) return <FileZip size={size} weight="duotone" />;
  if (["mp4","mov","avi","mkv","webm"].includes(ext)) return <FileVideo size={size} weight="duotone" />;
  if (["mp3","wav","ogg","flac","aac"].includes(ext)) return <FileAudio size={size} weight="duotone" />;
  if (["js","ts","jsx","tsx","py","go","rs","html","css"].includes(ext)) return <FileCode size={size} weight="duotone" />;
  return <File size={size} weight="duotone" />;
}

/* ─── component ─── */
export default function UploadPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [files, setFiles]           = useState([]);
  const [dragging, setDragging]     = useState(false);
  const [dragCounter, setDragCounter] = useState(0);

  // Upload state
  const [uploading, setUploading]         = useState(false);
  const [uploadStatus, setUploadStatus]   = useState("idle"); // idle|uploading|done|error
  const [progress, setProgress]           = useState(0);
  const [fileProgresses, setFileProgresses] = useState({});
  const [speed, setSpeed]                 = useState(0);    // bytes/sec
  const [eta, setEta]                     = useState(null); // seconds remaining
  const [errorMsg, setErrorMsg]           = useState("");
  const [shareLink, setShareLink]         = useState("");
  const [copied, setCopied]               = useState(false);

  // Refs for speed calculation
  const uploadStartTime = useRef(null);
  const totalBytesLoaded = useRef(0);

  /* ─── drag events ─── */
  const onDragEnter = useCallback((e) => { e.preventDefault(); setDragCounter(c => c + 1); setDragging(true); }, []);
  const onDragLeave = useCallback((e) => { e.preventDefault(); setDragCounter(c => { const n = c-1; if(n<=0) setDragging(false); return n; }); }, []);
  const onDragOver  = useCallback((e) => { e.preventDefault(); }, []);
  const onDrop      = useCallback((e) => {
    e.preventDefault(); setDragging(false); setDragCounter(0);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length) addFiles(dropped);
  }, []);

  useEffect(() => {
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover",  onDragOver);
    window.addEventListener("drop",      onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover",  onDragOver);
      window.removeEventListener("drop",      onDrop);
    };
  }, [onDragEnter, onDragLeave, onDragOver, onDrop]);

  /* ─── file management ─── */
  function addFiles(newFiles) {
    setShareLink(""); setProgress(0); setUploadStatus("idle");
    setErrorMsg(""); setFileProgresses({}); setSpeed(0); setEta(null);
    setFiles(prev => {
      const seen = new Set(prev.map(f => f.name + f.size));
      return [...prev, ...newFiles.filter(f => !seen.has(f.name + f.size))];
    });
  }

  function removeFile(idx) {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  }

  /* ─── UPLOAD ─── */
  async function handleUpload() {
    if (!files.length || uploading) return;
    setUploading(true); setUploadStatus("uploading");
    setProgress(0); setErrorMsg(""); setSpeed(0); setEta(null);
    uploadStartTime.current = Date.now();
    totalBytesLoaded.current = 0;

    try {
      // 1. Get presigned PUT URLs from backend
      const res = await fetch(`${API_BASE}/api/presign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: files.map(f => ({ name: f.name, size: f.size, type: f.type || "application/octet-stream" })),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server error (${res.status})`);
      }

      const { token, uploads } = await res.json();
      const totalSize = files.reduce((s, f) => s + f.size, 0);
      const loadedPerFile = {};

      // 2. PUT files directly to Wasabi via XHR (supports progress events)
      await Promise.all(
        uploads.map((info, idx) => {
          const file = files[idx];
          loadedPerFile[file.name] = 0;

          return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener("progress", (e) => {
              if (!e.lengthComputable) return;

              loadedPerFile[file.name] = e.loaded;

              // Overall progress
              const totalLoaded = Object.values(loadedPerFile).reduce((a,b) => a+b, 0);
              totalBytesLoaded.current = totalLoaded;
              const pct = totalSize > 0 ? Math.min(99, Math.round((totalLoaded / totalSize) * 100)) : 0;
              setProgress(pct);

              // Per-file progress
              setFileProgresses(p => ({ ...p, [file.name]: Math.round((e.loaded / e.total) * 100) }));

              // Speed & ETA
              const elapsed = (Date.now() - uploadStartTime.current) / 1000; // seconds
              if (elapsed > 0.5) {
                const bps = totalLoaded / elapsed;
                setSpeed(bps);
                const remaining = totalSize - totalLoaded;
                setEta(bps > 0 ? remaining / bps : null);
              }
            });

            xhr.addEventListener("load", () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                loadedPerFile[file.name] = file.size;
                setFileProgresses(p => ({ ...p, [file.name]: 100 }));
                resolve();
              } else {
                reject(new Error(`Upload failed for "${file.name}" (HTTP ${xhr.status})`));
              }
            });
            xhr.addEventListener("error", () => reject(new Error(`Network error uploading "${file.name}"`)));
            xhr.addEventListener("abort", () => reject(new Error(`Upload aborted for "${file.name}"`)));

            xhr.open("PUT", info.presignedUrl);
            xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
            xhr.send(file);
          });
        })
      );

      // 3. Done
      setProgress(100); setSpeed(0); setEta(null);
      setUploadStatus("done");
      setShareLink(`${window.location.origin}/share/${token}`);
    } catch (err) {
      console.error("Upload error:", err);
      setUploadStatus("error");
      setErrorMsg(err.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(shareLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const progressLabel =
    uploadStatus === "uploading" ? (progress < 100 ? "Uploading…" : "Finalising…")
    : uploadStatus === "done" ? "Upload complete" : "";

  return (
    <div className="page">
      <div className="noise" />

      {/* Drag overlay */}
      <AnimatePresence>
        {dragging && (
          <motion.div className="drag-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div className="drag-target"
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <CloudArrowUp size={52} weight="thin" />
              <p>Drop to upload</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="site-header">
        <LogoSlot />
        <div className="header-right">
          <span className="header-tag">Private Use Only</span>
        </div>
      </header>

      {/* Two-column layout */}
      <main className="main-layout">

        {/* LEFT — hero text */}
        <motion.section className="hero"
          initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: [0.22,1,0.36,1] }}
        >
          <p className="hero-eyebrow">Eastape Share</p>
          <h1 className="hero-title">
            Share Files<br />
            <span className="hero-title-accent">Securely &amp; Instantly</span>
          </h1>
          <p className="hero-desc">
            Fast, encrypted transfers. No limits. No friction.
          </p>
          <div className="hero-features">
            <div className="hero-feature"><span className="hero-feature-dot" />Direct upload to storage — nothing stored on our servers</div>
            <div className="hero-feature"><span className="hero-feature-dot" />Files expire automatically after 7 days</div>
            <div className="hero-feature"><span className="hero-feature-dot" />No account required</div>
          </div>
        </motion.section>

        {/* RIGHT — upload card */}
        <motion.section className="upload-section"
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.22,1,0.36,1] }}
        >
          <div className="glass-card">

            {/* Drop zone */}
            {files.length === 0 && (
              <button className="drop-zone" onClick={() => fileInputRef.current?.click()} type="button">
                <CloudArrowUp size={40} weight="thin" className="drop-icon" />
                <p className="drop-title">Drag &amp; Drop files here</p>
                <p className="drop-sub">or <span className="drop-link">click to browse</span></p>
                <p className="drop-hint">Any file type • Max 2 GB per file</p>
              </button>
            )}

            {/* File list */}
            <AnimatePresence>
              {files.length > 0 && (
                <motion.div className="file-list-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className="file-list-header">
                    <span className="file-list-count">{files.length} file{files.length !== 1 ? "s" : ""} selected</span>
                    <button className="add-more-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading} type="button">
                      + Add more
                    </button>
                  </div>
                  <div className="file-list">
                    <AnimatePresence>
                      {files.map((file, idx) => (
                        <motion.div key={file.name + file.size + idx} className="file-item"
                          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -16, transition: { duration: 0.15 } }}
                          transition={{ delay: idx * 0.04 }}
                        >
                          <span className="file-icon">{getFileIcon(file.name)}</span>
                          <div className="file-info">
                            <span className="file-name">{file.name}</span>
                            <span className="file-size">{formatSize(file.size)}</span>
                          </div>
                          {uploading && fileProgresses[file.name] !== undefined && (
                            <span className="file-pct">{fileProgresses[file.name]}%</span>
                          )}
                          {!uploading && uploadStatus !== "done" && (
                            <button className="file-remove" onClick={() => removeFile(idx)} title="Remove">
                              <X size={13} weight="bold" />
                            </button>
                          )}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Progress + speed + ETA */}
            <AnimatePresence>
              {(uploadStatus === "uploading" || uploadStatus === "done") && (
                <motion.div className="progress-wrap"
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0 }}
                >
                  <div className="progress-label">
                    <span>{progressLabel}</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${progress}%` }} />
                  </div>
                  {/* Speed & ETA — only during active upload */}
                  {uploadStatus === "uploading" && progress < 100 && (
                    <div className="upload-stats">
                      <div className="upload-stat">
                        <span>Speed</span>
                        <strong>{speed > 0 ? formatSpeed(speed) : "—"}</strong>
                      </div>
                      <div className="upload-stat">
                        <span>ETA</span>
                        <strong>{eta !== null ? formatEta(eta) : "—"}</strong>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error */}
            <AnimatePresence>
              {uploadStatus === "error" && (
                <motion.div className="error-box"
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                >
                  <Warning size={16} weight="fill" style={{ flexShrink: 0 }} />
                  {errorMsg}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Share link */}
            <AnimatePresence>
              {shareLink && (
                <motion.div className="share-link-wrap"
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
                >
                  <p className="share-label"><CheckCircle size={15} weight="fill" className="share-check" /> Link ready — share it!</p>
                  <div className="share-row">
                    <input readOnly value={shareLink} className="share-input" onFocus={e => e.target.select()} />
                    <motion.button className={`copy-btn ${copied ? "copied" : ""}`} onClick={copyLink}
                      whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                    >
                      {copied ? <CheckCircle size={15} weight="fill" /> : <Copy size={15} />}
                      {copied ? "Copied!" : "Copy"}
                    </motion.button>
                  </div>
                  <button className="open-link-btn" onClick={() => navigate(`/share/${shareLink.split("/share/")[1]}`)}>
                    Open share page <ArrowRight size={14} weight="bold" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Upload button */}
            {files.length > 0 && !shareLink && (
              <motion.button className="upload-btn" onClick={handleUpload} disabled={uploading}
                whileHover={!uploading ? { scale: 1.01 } : {}} whileTap={!uploading ? { scale: 0.99 } : {}}
              >
                {uploading
                  ? <><span className="spinner" /> Uploading… {progress}%</>
                  : <><CloudArrowUp size={17} weight="bold" /> Upload {files.length} file{files.length !== 1 ? "s" : ""}</>
                }
              </motion.button>
            )}
          </div>
        </motion.section>
      </main>

      {/* Footer */}
      <footer className="site-footer">
        <span>© {new Date().getFullYear()} Eastape Films. All rights reserved.</span>
        <span>Currently for Private use only</span>
      </footer>

      <input ref={fileInputRef} type="file" multiple hidden
        onChange={e => {
          const picked = Array.from(e.target.files || []);
          if (picked.length) addFiles(picked);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/* ─── Logo slot component ───────────────────────────────────
 * Looks for /logo.png in the public folder.
 * If it exists, renders it. If not, shows text fallback.
 * To add your logo: put logo.png inside the /public folder.
 ─────────────────────────────────────────────────────────── */
function LogoSlot() {
  const [hasLogo, setHasLogo] = React.useState(true);
  return hasLogo ? (
    <img
      src="/logo.png"
      alt="Eastape Share"
      className="logo-img"
      onError={() => setHasLogo(false)}
    />
  ) : (
    <div className="logo-text-fallback">
      <span className="logo-dot" />
      Eastape Share
    </div>
  );
}
