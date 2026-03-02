import React, { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  CloudArrowUp, File, FileImage, FilePdf, FileZip, FileVideo, FileAudio,
  FileCode, X, Copy, CheckCircle, ArrowRight, Lightning, Lock, Globe, Warning,
} from "@phosphor-icons/react";

/* ─── config ──────────────────────────────────────── */
const API_BASE = import.meta.env.VITE_API_BASE || "";

/* ─── helpers ─────────────────────────────────────── */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(name) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (["jpg","jpeg","png","gif","webp","svg"].includes(ext)) return <FileImage weight="duotone" size={22} />;
  if (ext === "pdf") return <FilePdf weight="duotone" size={22} />;
  if (["zip","rar","7z","tar","gz"].includes(ext)) return <FileZip weight="duotone" size={22} />;
  if (["mp4","mov","avi","mkv","webm"].includes(ext)) return <FileVideo weight="duotone" size={22} />;
  if (["mp3","wav","ogg","flac","aac"].includes(ext)) return <FileAudio weight="duotone" size={22} />;
  if (["js","ts","jsx","tsx","py","go","rs","html","css"].includes(ext)) return <FileCode weight="duotone" size={22} />;
  return <File weight="duotone" size={22} />;
}

/* ─── component ───────────────────────────────────── */
export default function UploadPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);

  const [uploading, setUploading]       = useState(false);
  const [uploadStatus, setUploadStatus] = useState("idle"); // idle | uploading | done | error
  const [progress, setProgress]         = useState(0);
  const [fileProgresses, setFileProgresses] = useState({});
  const [errorMsg, setErrorMsg]         = useState("");
  const [shareLink, setShareLink]       = useState("");
  const [copied, setCopied]             = useState(false);

  /* ─── window drag handlers ─── */
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    setDragCounter((c) => c + 1);
    setDragging(true);
  }, []);
  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setDragCounter((c) => {
      const n = c - 1;
      if (n <= 0) setDragging(false);
      return n;
    });
  }, []);
  const handleDragOver = useCallback((e) => { e.preventDefault(); }, []);
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    setDragCounter(0);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length) addFiles(dropped);
  }, []);

  useEffect(() => {
    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

  /* ─── file management ─── */
  function addFiles(newFiles) {
    setShareLink(""); setProgress(0); setUploadStatus("idle");
    setErrorMsg(""); setFileProgresses({});
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => f.name + f.size));
      return [...prev, ...newFiles.filter((f) => !seen.has(f.name + f.size))];
    });
  }
  function removeFile(idx) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  /* ─── REAL UPLOAD ─── */
  async function handleUpload() {
    if (!files.length || uploading) return;
    setUploading(true);
    setUploadStatus("uploading");
    setProgress(0);
    setErrorMsg("");

    try {
      // 1. Ask backend for presigned PUT URLs
      const presignRes = await fetch(`${API_BASE}/api/presign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: files.map((f) => ({
            name: f.name,
            size: f.size,
            type: f.type || "application/octet-stream",
          })),
        }),
      });

      if (!presignRes.ok) {
        const err = await presignRes.json().catch(() => ({}));
        throw new Error(err.error || "Failed to initialise upload");
      }

      const { token, uploads } = await presignRes.json();

      // 2. PUT each file directly to Wasabi — no bytes through Vercel
      const totalSize = files.reduce((s, f) => s + f.size, 0);
      const loaded = {};

      const updateProgress = () => {
        const totalLoaded = Object.values(loaded).reduce((a, b) => a + b, 0);
        setProgress(totalSize > 0 ? Math.round((totalLoaded / totalSize) * 100) : 0);
      };

      await Promise.all(
        uploads.map((info, idx) => {
          const file = files[idx];
          loaded[file.name] = 0;
          return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.upload.addEventListener("progress", (e) => {
              if (e.lengthComputable) {
                loaded[file.name] = e.loaded;
                setFileProgresses((p) => ({ ...p, [file.name]: Math.round((e.loaded / e.total) * 100) }));
                updateProgress();
              }
            });
            xhr.addEventListener("load", () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                loaded[file.name] = file.size;
                setFileProgresses((p) => ({ ...p, [file.name]: 100 }));
                updateProgress();
                resolve();
              } else {
                reject(new Error(`Upload failed for "${file.name}" (HTTP ${xhr.status})`));
              }
            });
            xhr.addEventListener("error",  () => reject(new Error(`Network error uploading "${file.name}"`)));
            xhr.addEventListener("abort",  () => reject(new Error(`Upload aborted for "${file.name}"`)));
            xhr.open("PUT", info.presignedUrl);
            xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
            xhr.send(file);
          });
        })
      );

      // 3. Done — surface share link
      setProgress(100);
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
    uploadStatus === "uploading" ? (progress < 100 ? `Uploading… ${progress}%` : "Finalising…")
    : uploadStatus === "done"   ? "Complete!"
    : "";

  return (
    <div className="page">
      <div className="noise" />
      <div className="orb orb-1" /><div className="orb orb-2" /><div className="orb orb-3" />

      {/* Full-screen drag overlay */}
      <AnimatePresence>
        {dragging && (
          <motion.div className="drag-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
          >
            <motion.div className="drag-target"
              initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }} transition={{ duration: 0.2 }}
            >
              <CloudArrowUp size={56} weight="thin" />
              <p>Drop files to upload</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="site-header">
        <div className="logo">
          <span className="logo-icon"><Lightning size={18} weight="fill" /></span>
          Eastape Share
        </div>
        <nav className="header-nav">
          <span><Globe size={15} weight="regular" /> Public Beta</span>
        </nav>
      </header>

      <main className="main-layout">
        {/* LEFT hero */}
        <motion.section className="hero"
          initial={{ opacity: 0, x: -32 }} animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="hero-badge"><Lightning size={13} weight="fill" />Instant • Secure • Free</div>
          <h1 className="hero-title">
            Share files<br />
            <span className="gradient-word">effortlessly.</span>
          </h1>
          <p className="hero-desc">
            Drop any file. Get a link. Share it with the world — or keep it between you and one other person.
          </p>
          <div className="feature-pills">
            <div className="pill"><CheckCircle size={14} weight="fill" /> Up to 2 GB</div>
            <div className="pill"><Lock size={14} weight="fill" /> Direct transfer</div>
            <div className="pill"><Globe size={14} weight="fill" /> No account needed</div>
          </div>
        </motion.section>

        {/* RIGHT upload box */}
        <motion.section className="upload-section"
          initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="glass-card">

            {/* Drop zone */}
            {files.length === 0 && (
              <button className="drop-zone" onClick={() => fileInputRef.current?.click()} type="button">
                <CloudArrowUp size={44} weight="thin" className="drop-icon" />
                <p className="drop-title">Drag & drop files here</p>
                <p className="drop-sub">or <span className="drop-link">browse from your computer</span></p>
                <p className="drop-hint">Any file type • Max 2 GB per file</p>
              </button>
            )}

            {/* File list */}
            <AnimatePresence>
              {files.length > 0 && (
                <motion.div className="file-list-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className="file-list-header">
                    <span className="file-list-count">{files.length} file{files.length !== 1 ? "s" : ""}</span>
                    <button className="add-more-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading} type="button">
                      + Add more
                    </button>
                  </div>
                  <div className="file-list">
                    <AnimatePresence>
                      {files.map((file, idx) => (
                        <motion.div key={`${file.name}-${file.size}-${idx}`} className="file-item"
                          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
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
                              <X size={14} weight="bold" />
                            </button>
                          )}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Progress bar */}
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
                    <motion.div className="progress-fill" style={{ width: `${progress}%` }} transition={{ duration: 0.3 }} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error */}
            <AnimatePresence>
              {uploadStatus === "error" && (
                <motion.div className="error-box" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <Warning size={16} weight="fill" /> {errorMsg}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Share link */}
            <AnimatePresence>
              {shareLink && (
                <motion.div className="share-link-wrap"
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
                >
                  <p className="share-label"><CheckCircle size={15} weight="fill" className="share-check" /> Your link is ready</p>
                  <div className="share-row">
                    <input readOnly value={shareLink} className="share-input" onFocus={(e) => e.target.select()} />
                    <motion.button className={`copy-btn ${copied ? "copied" : ""}`} onClick={copyLink}
                      whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.96 }}
                    >
                      {copied ? <CheckCircle size={16} weight="fill" /> : <Copy size={16} />}
                      {copied ? "Copied!" : "Copy"}
                    </motion.button>
                  </div>
                  <button className="open-link-btn" onClick={() => navigate(`/share/${shareLink.split("/share/")[1]}`)}>
                    Open share page <ArrowRight size={15} weight="bold" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Upload button */}
            {files.length > 0 && !shareLink && (
              <motion.button className="upload-btn" onClick={handleUpload} disabled={uploading}
                whileHover={!uploading ? { scale: 1.02 } : {}} whileTap={!uploading ? { scale: 0.98 } : {}}
              >
                {uploading
                  ? <><span className="spinner" /> Uploading… {progress}%</>
                  : <><CloudArrowUp size={18} weight="bold" /> Upload {files.length} file{files.length !== 1 ? "s" : ""}</>
                }
              </motion.button>
            )}
          </div>
        </motion.section>
      </main>

      <input ref={fileInputRef} type="file" multiple hidden
        onChange={(e) => {
          const picked = Array.from(e.target.files || []);
          if (picked.length) addFiles(picked);
          e.target.value = "";
        }}
      />
    </div>
  );
}
