import React, { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  CloudArrowUp, File, FileImage, FilePdf, FileZip, FileVideo, FileAudio,
  FileCode, Trash, Copy, CheckCircle, ArrowRight, Warning, Lock,
} from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";
import SiteHeader from "./SiteHeader";
import { driveApi } from "./lib/api.js";

/* ─── helpers ─── */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
function formatSpeed(bps) {
  if (bps < 1024) return `${bps} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}
function formatEta(s) {
  if (!isFinite(s) || s < 0) return "—";
  if (s < 60) return `${Math.ceil(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.ceil(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}
function getFileIcon(name, size = 18) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (["jpg","jpeg","png","gif","webp","svg"].includes(ext)) return <FileImage size={size} weight="duotone"/>;
  if (ext === "pdf") return <FilePdf size={size} weight="duotone"/>;
  if (["zip","rar","7z","tar","gz"].includes(ext)) return <FileZip size={size} weight="duotone"/>;
  if (["mp4","mov","avi","mkv","webm"].includes(ext)) return <FileVideo size={size} weight="duotone"/>;
  if (["mp3","wav","ogg","flac","aac"].includes(ext)) return <FileAudio size={size} weight="duotone"/>;
  if (["js","ts","jsx","tsx","py","go","rs","html","css"].includes(ext)) return <FileCode size={size} weight="duotone"/>;
  return <File size={size} weight="duotone"/>;
}

export default function UploadPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInputRef = useRef(null);

  const [files, setFiles]             = useState([]);
  const [dragging, setDragging]       = useState(false);
  const [dragCounter, setDragCounter] = useState(0);
  const [uploading, setUploading]     = useState(false);
  const [status, setStatus]           = useState("idle"); // idle|uploading|done|error
  const [progress, setProgress]       = useState(0);
  const [fileProgresses, setFileProgresses] = useState({});
  const [speed, setSpeed]             = useState(0);
  const [eta, setEta]                 = useState(null);
  const [errorMsg, setErrorMsg]       = useState("");
  const [shareLink, setShareLink]     = useState("");
  const [copied, setCopied]           = useState(false);
  const [loginRequired, setLoginRequired] = useState(false);

  const uploadStartTime = useRef(null);

  /* ─── drag ─── */
  const onDragEnter = useCallback((e) => { e.preventDefault(); setDragCounter(c => c+1); setDragging(true); }, []);
  const onDragLeave = useCallback((e) => { e.preventDefault(); setDragCounter(c => { const n=c-1; if(n<=0) setDragging(false); return n; }); }, []);
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

  function addFiles(newFiles) {
    setShareLink(""); setProgress(0); setStatus("idle");
    setErrorMsg(""); setFileProgresses({}); setSpeed(0); setEta(null);
    setLoginRequired(false);
    setFiles(prev => {
      const seen = new Set(prev.map(f => f.name + f.size));
      return [...prev, ...newFiles.filter(f => !seen.has(f.name + f.size))];
    });
  }
  function removeFile(idx) { setFiles(prev => prev.filter((_, i) => i !== idx)); }

  const totalBytes = files.reduce((s,f) => s + f.size, 0);

  /* ─── upload ─── */
  async function handleUpload() {
    if (!files.length || uploading) return;

    // Auth guard — show brief message then redirect to login
    if (!user) {
      setLoginRequired(true);
      setTimeout(() => {
        navigate("/login", { state: { message: "Please log in to upload files." } });
      }, 1200);
      return;
    }

    setUploading(true); setStatus("uploading");
    setProgress(0); setErrorMsg(""); setSpeed(0); setEta(null);
    uploadStartTime.current = Date.now();

    try {
      const { token, uploads } = await driveApi.presign({
        files: files.map(f => ({ name: f.name, size: f.size, type: f.type || "application/octet-stream" })),
        userId: user?.id || null,
        folderId: null,
      });

      const loadedMap = {};
      await Promise.all(
        uploads.map((info, idx) => {
          const file = files[idx];
          loadedMap[file.name] = 0;
          return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.upload.addEventListener("progress", (e) => {
              if (!e.lengthComputable) return;
              loadedMap[file.name] = e.loaded;
              const totalLoaded = Object.values(loadedMap).reduce((a,b) => a+b, 0);
              const pct = totalBytes > 0 ? Math.min(99, Math.round((totalLoaded / totalBytes) * 100)) : 0;
              setProgress(pct);
              setFileProgresses(p => ({ ...p, [file.name]: Math.round((e.loaded / e.total) * 100) }));
              const elapsed = (Date.now() - uploadStartTime.current) / 1000;
              if (elapsed > 0.5) {
                const bps = totalLoaded / elapsed;
                setSpeed(bps);
                setEta(bps > 0 ? (totalBytes - totalLoaded) / bps : null);
              }
            });
            xhr.addEventListener("load", () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                loadedMap[file.name] = file.size;
                setFileProgresses(p => ({ ...p, [file.name]: 100 }));
                resolve();
              } else {
                reject(new Error(`Upload failed for "${file.name}" (HTTP ${xhr.status})`));
              }
            });
            xhr.addEventListener("error", () => reject(new Error(`Network error uploading "${file.name}"`)));
            xhr.open("PUT", info.presignedUrl);
            xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
            xhr.send(file);
          });
        })
      );

      setProgress(100); setSpeed(0); setEta(null);
      setStatus("done");
      setShareLink(`${window.location.origin}/share/${token}`);
    } catch (err) {
      console.error("Upload error:", err);
      setStatus("error");
      setErrorMsg(
        err.code === "STORAGE_QUOTA_EXCEEDED"
          ? err.message + " Upgrade your plan to get more storage."
          : err.message || "Upload failed. Please try again."
      );
    } finally {
      setUploading(false);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(shareLink).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  }

  const progressLabel =
    status === "uploading" ? (progress < 100 ? "Uploading…" : "Finalising…")
    : status === "done" ? "Upload complete" : "";

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
              <CloudArrowUp size={48} weight="thin" />
              <p>Drop to upload</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <SiteHeader />

      {/* Two columns */}
      <main className="main-layout">

        {/* LEFT — hero */}
        <motion.section className="hero"
          initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.65, ease: [0.22,1,0.36,1] }}
        >
          <h1 className="hero-title">
            Your Creative Studio<br />
            <span className="hero-title-accent">Organised &amp; Delivered</span>
          </h1>
          <p className="hero-desc">Production management, file sharing, and video review for creative teams.</p>
          <div className="hero-features">
            <div className="hero-feature"><span className="hero-feature-dot"/>Direct upload — no server middleman</div>
            <div className="hero-feature"><span className="hero-feature-dot"/>Links expire automatically after 7 days</div>
            <div className="hero-feature"><span className="hero-feature-dot"/>Free account required to upload</div>
          </div>
        </motion.section>

        {/* RIGHT — upload card */}
        <motion.section className="upload-section"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.08, ease: [0.22,1,0.36,1] }}
        >
          <div className="glass-card">

            {/* Drop zone — always visible when no files */}
            {files.length === 0 && (
              <button className="drop-zone" onClick={() => fileInputRef.current?.click()} type="button">
                <CloudArrowUp size={32} weight="thin" className="drop-icon"/>
                <p className="drop-title">Drag &amp; Drop files here</p>
                <p className="drop-sub">or <span className="drop-link">click to browse</span></p>
              </button>
            )}

            {/* Files selected */}
            <AnimatePresence>
              {files.length > 0 && (
                <motion.div className="file-list-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  {/* Drop zone mini */}
                  <button className="drop-zone" onClick={() => fileInputRef.current?.click()} type="button" style={{ minHeight: 72 }}>
                    <CloudArrowUp size={22} weight="thin" className="drop-icon"/>
                    <p className="drop-sub"><span className="drop-link">Drag &amp; Drop files</span> or click to browse</p>
                  </button>

                  <div className="file-list-header">
                    <span className="file-list-count">{files.length} file{files.length !== 1 ? "s" : ""}</span>
                    <button className="add-more-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading} type="button">
                      + Add more
                    </button>
                  </div>

                  <div className="file-list">
                    <AnimatePresence>
                      {files.map((file, idx) => (
                        <motion.div key={file.name + file.size + idx} className="file-item"
                          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -12, transition: { duration: 0.15 } }}
                          transition={{ delay: idx * 0.03 }}
                        >
                          <span className="file-icon">{getFileIcon(file.name)}</span>
                          <div className="file-info">
                            <span className="file-name">{file.name}</span>
                            <span className="file-size">{formatSize(file.size)}</span>
                          </div>
                          {uploading && fileProgresses[file.name] !== undefined && (
                            <span className="file-pct">{fileProgresses[file.name]}%</span>
                          )}
                          {!uploading && status !== "done" && (
                            <button className="file-remove" onClick={() => removeFile(idx)} title="Remove">
                              <Trash size={13} weight="regular"/>
                            </button>
                          )}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>

                  {/* Total size */}
                  {status === "idle" && (
                    <div className="total-size-row">
                      Total size: <strong>{formatSize(totalBytes)}</strong>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Progress */}
            <AnimatePresence>
              {(status === "uploading" || status === "done") && (
                <motion.div className="progress-wrap"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                >
                  <div className="progress-label">
                    <span>{progressLabel}</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${progress}%` }}/>
                  </div>
                  {status === "uploading" && progress < 100 && (
                    <div className="upload-stats">
                      <div className="upload-stat"><span>Speed</span><strong>{speed > 0 ? formatSpeed(speed) : "—"}</strong></div>
                      <div className="upload-stat"><span>ETA</span><strong>{eta !== null ? formatEta(eta) : "—"}</strong></div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error */}
            <AnimatePresence>
              {status === "error" && (
                <motion.div className="error-box"
                  initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                >
                  <Warning size={15} weight="fill" style={{ flexShrink: 0, marginTop: 1 }}/>
                  {errorMsg}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Login required warning */}
            <AnimatePresence>
              {loginRequired && (
                <motion.div className="login-required-msg"
                  initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                >
                  <Lock size={13} weight="fill" style={{ flexShrink: 0 }}/>
                  Login required. Redirecting to sign in…
                </motion.div>
              )}
            </AnimatePresence>

            {/* Share link */}
            <AnimatePresence>
              {shareLink && (
                <motion.div className="share-link-wrap"
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
                >
                  <p className="share-label"><CheckCircle size={14} weight="fill" className="share-check"/> Link ready — share it!</p>
                  <div className="share-row">
                    <input readOnly value={shareLink} className="share-input" onFocus={e => e.target.select()}/>
                    <motion.button className={`copy-btn ${copied ? "copied" : ""}`} onClick={copyLink}
                      whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                    >
                      {copied ? <CheckCircle size={14} weight="fill"/> : <Copy size={14}/>}
                      {copied ? "Copied!" : "Copy"}
                    </motion.button>
                  </div>
                  <button className="open-link-btn" onClick={() => navigate(`/share/${shareLink.split("/share/")[1]}`)}>
                    Open share page <ArrowRight size={13} weight="bold"/>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Upload button */}
            {files.length > 0 && !shareLink && (
              <motion.button className="upload-btn" onClick={handleUpload} disabled={uploading || loginRequired}
                whileHover={!uploading && !loginRequired ? { scale: 1.01 } : {}}
                whileTap={!uploading && !loginRequired ? { scale: 0.99 } : {}}
              >
                {uploading
                  ? <><span className="spinner"/> Uploading… {progress}%</>
                  : <><CloudArrowUp size={16} weight="bold"/> Transfer Files</>
                }
              </motion.button>
            )}
          </div>
        </motion.section>
      </main>

      {/* Footer */}
      <footer className="site-footer">
        <span>© {new Date().getFullYear()} Eastape Films. All rights reserved.</span>
        <span className="footer-links">
          <Link to="/pricing">Pricing</Link>
          <span className="footer-sep">·</span>
          <Link to="/privacy">Privacy Policy</Link>
          <span className="footer-sep">·</span>
          <Link to="/terms">Terms &amp; Conditions</Link>
        </span>
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
