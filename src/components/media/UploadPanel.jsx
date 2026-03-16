/**
 * UploadPanel — drag-and-drop TUS upload to Bunny Stream.
 * Appears as a full slide-in overlay within the project view.
 */
import React, { useState, useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { CloudArrowUp, X, CheckCircle, Warning, File, FileVideo } from "@phosphor-icons/react";
import * as tus from "tus-js-client";
import { userApiFetch, formatSize } from "../../lib/userApi";

export default function UploadPanel({ projectId, folderId, onClose, onUploaded }) {
  const [files,    setFiles]    = useState([]);
  const [dragging, setDragging] = useState(false);
  const [dragCount, setDragCount] = useState(0);
  const fileInputRef = useRef(null);

  function addFiles(newFiles) {
    const items = Array.from(newFiles).map(f => ({
      file: f,
      id: Math.random().toString(36).slice(2),
      status: "queued",   // queued|uploading|processing|ready|error
      progress: 0,
      assetId: null,
      error: null,
    }));
    setFiles(prev => [...prev, ...items]);
    items.forEach(item => startUpload(item));
  }

  const onDragEnter  = useCallback(e => { e.preventDefault(); setDragCount(c => c + 1); setDragging(true); }, []);
  const onDragLeave  = useCallback(e => { e.preventDefault(); setDragCount(c => { const n = c-1; if(n<=0) setDragging(false); return n; }); }, []);
  const onDragOver   = useCallback(e => { e.preventDefault(); }, []);
  const onDropFiles  = useCallback(e => {
    e.preventDefault(); setDragging(false); setDragCount(0);
    addFiles(e.dataTransfer.files);
  }, [projectId, folderId]);

  useEffect(() => {
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover",  onDragOver);
    window.addEventListener("drop",      onDropFiles);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover",  onDragOver);
      window.removeEventListener("drop",      onDropFiles);
    };
  }, [onDragEnter, onDragLeave, onDragOver, onDropFiles]);

  function updateFile(id, patch) {
    setFiles(fs => fs.map(f => f.id === id ? { ...f, ...patch } : f));
  }

  async function startUpload(item) {
    updateFile(item.id, { status: "uploading" });

    const f = item.file;
    const isVideo = f.type.startsWith("video/");

    try {
      // 1. Get upload URL from our API
      const initData = await userApiFetch("/api/media/upload-init", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          folderId: folderId || null,
          name: f.name,
          size: f.size,
          mimeType: f.type,
          type: isVideo ? "video" : f.type.startsWith("image/") ? "image" : f.type.startsWith("audio/") ? "audio" : "document",
        }),
      });

      updateFile(item.id, { assetId: initData.assetId });

      if (initData.uploadUrl && isVideo) {
        // 2. TUS upload to Bunny Stream
        await new Promise((resolve, reject) => {
          const upload = new tus.Upload(f, {
            uploadUrl: initData.uploadUrl,
            retryDelays: [0, 3000, 5000, 10000, 20000],
            chunkSize: 50 * 1024 * 1024,
            metadata: { name: f.name, filetype: f.type },
            headers: initData.tusHeaders || {},
            onProgress: (uploaded, total) => {
              updateFile(item.id, { progress: Math.round((uploaded / total) * 90) });
            },
            onSuccess: resolve,
            onError: reject,
          });
          upload.start();
        });

        // 3. Poll for ready status
        updateFile(item.id, { status: "processing", progress: 92 });
        await pollUntilReady(initData.assetId, item.id);
      } else {
        // Non-video: already saved in DB by upload-init
        updateFile(item.id, { status: "ready", progress: 100 });
        if (onUploaded) onUploaded({ id: initData.assetId, name: f.name, type: "document", file_size: f.size });
      }
    } catch (err) {
      console.error("Upload error:", err);
      updateFile(item.id, { status: "error", error: err.message });
    }
  }

  async function pollUntilReady(assetId, fileId) {
    const MAX_POLLS = 60; // 3 min
    for (let i = 0; i < MAX_POLLS; i++) {
      await sleep(3000);
      try {
        const data = await userApiFetch(`/api/media/upload-status?assetId=${assetId}`);
        if (data.status === "ready") {
          updateFile(fileId, { status: "ready", progress: 100 });
          if (onUploaded) {
            onUploaded({
              id: assetId,
              name: files.find(f => f.id === fileId)?.file?.name || "Asset",
              type: "video",
              bunny_thumbnail_url: data.thumbnailUrl,
              bunny_video_status: "ready",
            });
          }
          return;
        }
        if (data.status === "error") {
          updateFile(fileId, { status: "error", error: "Video processing failed" });
          return;
        }
        updateFile(fileId, { progress: Math.min(99, 92 + i) });
      } catch {
        // continue polling
      }
    }
    updateFile(fileId, { status: "error", error: "Processing timed out" });
  }

  const allDone = files.length > 0 && files.every(f => f.status === "ready" || f.status === "error");

  return (
    <motion.div
      className="upload-panel-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="upload-panel"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 280 }}
      >
        <div className="upload-panel-header">
          <span className="upload-panel-title">
            <CloudArrowUp size={18} weight="duotone" /> Upload Files
          </span>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Drop zone */}
        <div
          className={`upload-panel-dropzone ${dragging ? "dragging" : ""}`}
          onClick={() => fileInputRef.current?.click()}
        >
          <CloudArrowUp size={36} weight="thin" />
          <p className="drop-title">Drag & drop files here</p>
          <p className="drop-sub">or <span className="drop-link">click to browse</span></p>
          <p style={{ fontSize: 11, color: "var(--t3)", marginTop: 4 }}>
            Videos are processed via Bunny Stream
          </p>
        </div>

        {/* File queue */}
        {files.length > 0 && (
          <div className="upload-panel-queue">
            {files.map(item => (
              <div key={item.id} className="upload-queue-item">
                <div className="upload-queue-icon">
                  {item.file.type.startsWith("video/")
                    ? <FileVideo size={20} weight="duotone" style={{ color: "var(--purple-l)" }} />
                    : <File      size={20} weight="duotone" style={{ color: "var(--blue-l)"   }} />}
                </div>
                <div className="upload-queue-info">
                  <span className="upload-queue-name">{item.file.name}</span>
                  <span className="upload-queue-size">{formatSize(item.file.size)}</span>
                  {(item.status === "uploading" || item.status === "processing") && (
                    <div className="progress-track" style={{ marginTop: 4 }}>
                      <div className="progress-fill" style={{ width: `${item.progress}%` }} />
                    </div>
                  )}
                  {item.status === "processing" && (
                    <span style={{ fontSize: 11, color: "var(--t3)" }}>Processing video…</span>
                  )}
                  {item.error && (
                    <span style={{ fontSize: 11, color: "#f87171" }}>{item.error}</span>
                  )}
                </div>
                <div className="upload-queue-status">
                  {item.status === "queued"     && <span className="spinner" />}
                  {item.status === "uploading"  && <span style={{ fontSize: 11, color: "var(--t2)" }}>{item.progress}%</span>}
                  {item.status === "processing" && <span className="spinner" />}
                  {item.status === "ready"      && <CheckCircle size={18} style={{ color: "#22c55e" }} />}
                  {item.status === "error"      && <Warning size={18} style={{ color: "#f87171" }} />}
                </div>
              </div>
            ))}
          </div>
        )}

        {allDone && (
          <div style={{ padding: "0 20px 20px" }}>
            <button className="btn-primary-sm" onClick={onClose} style={{ width: "100%", justifyContent: "center" }}>
              Done
            </button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={e => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }}
        />
      </motion.div>
    </motion.div>
  );
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
