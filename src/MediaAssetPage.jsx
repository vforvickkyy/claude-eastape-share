import React, { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, DownloadSimple, Trash, Copy, CheckCircle,
  ChatCircle, ClockCounterClockwise, Info, PencilSimple,
  Check, X, SidebarSimple,
} from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";
import DashboardLayout from "./DashboardLayout";
import CommentsPanel from "./components/media/CommentsPanel";
import VersionsPanel from "./components/media/VersionsPanel";
import ShareModal from "./components/media/ShareModal";
import { userApiFetch, formatSize } from "./lib/userApi";

const STATUS_OPTIONS = [
  { value: "in_review", label: "In Review", class: "badge-review"   },
  { value: "approved",  label: "Approved",  class: "badge-approved" },
  { value: "revision",  label: "Revision",  class: "badge-revision" },
];

export default function MediaAssetPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { id: assetId } = useParams();

  const [asset,       setAsset]      = useState(null);
  const [loading,     setLoading]    = useState(true);
  const [tab,         setTab]        = useState("comments"); // comments|versions|info
  const [currentTime, setCurrentTime] = useState(0);
  const [editName,    setEditName]   = useState(false);
  const [nameVal,     setNameVal]    = useState("");
  const [copied,      setCopied]     = useState(false);
  const [showShare,   setShowShare]  = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editNotes,   setEditNotes]   = useState(false);
  const [notesVal,    setNotesVal]    = useState("");

  const iframeRef = useRef(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login", { replace: true });
  }, [user, authLoading]);

  useEffect(() => {
    if (!user || !assetId) return;
    userApiFetch(`/api/media/assets?id=${assetId}`)
      .then(async d => {
        let asset = d.asset;
        // Fix old-format playback URL stored before the embed URL fix
        if (asset?.bunny_video_status === "ready" && asset.bunny_playback_url && !asset.bunny_playback_url.includes("/embed/")) {
          try {
            const fixed = await userApiFetch(`/api/media/upload-status?assetId=${assetId}`);
            if (fixed.playbackUrl) asset = { ...asset, bunny_playback_url: fixed.playbackUrl };
          } catch { /* ignore */ }
        }
        setAsset(asset);
        setNameVal(asset?.name || "");
        setNotesVal(asset?.notes || "");
      })
      .catch(() => navigate("/media"))
      .finally(() => setLoading(false));
  }, [user, assetId]);

  // ── Bunny Stream postMessage ─────────────────────────────────────
  useEffect(() => {
    function onMessage(e) {
      if (!e.data || typeof e.data !== "object") return;
      if (e.data.event === "timeupdate" && typeof e.data.currentTime === "number") {
        setCurrentTime(e.data.currentTime);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function seekTo(seconds) {
    iframeRef.current?.contentWindow?.postMessage({ event: "seek", seconds }, "*");
  }

  // ── Save name ────────────────────────────────────────────────────
  async function saveName() {
    if (!nameVal.trim() || nameVal === asset.name) { setEditName(false); return; }
    await userApiFetch(`/api/media/assets?id=${assetId}`, {
      method: "PUT",
      body: JSON.stringify({ name: nameVal.trim() }),
    });
    setAsset(a => ({ ...a, name: nameVal.trim() }));
    setEditName(false);
  }

  // ── Save notes ───────────────────────────────────────────
  async function saveNotes() {
    await userApiFetch(`/api/media/assets?id=${assetId}`, {
      method: "PUT",
      body: JSON.stringify({ notes: notesVal }),
    });
    setAsset(a => ({ ...a, notes: notesVal }));
    setEditNotes(false);
  }

  // ── Status change ────────────────────────────────────────────────
  async function changeStatus(status) {
    await userApiFetch(`/api/media/assets?id=${assetId}`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
    setAsset(a => ({ ...a, status }));
  }

  // ── Delete ───────────────────────────────────────────────────────
  async function handleDelete() {
    if (!window.confirm("Delete this asset? This cannot be undone.")) return;
    await userApiFetch(`/api/media/assets?id=${assetId}`, { method: "DELETE" });
    navigate(`/media/project/${asset.project_id}`);
  }

  // ── Copy share link ──────────────────────────────────────────────
  async function copyShareLink() {
    const data = await userApiFetch("/api/media/share", {
      method: "POST",
      body: JSON.stringify({ assetId, allowDownload: true, allowComments: true }),
    });
    const token = data.link?.token || (data.shareUrl || "").split("/").pop();
    const url = `${window.location.origin}/media/share/${token}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const statusMeta = STATUS_OPTIONS.find(s => s.value === asset?.status) || STATUS_OPTIONS[0];
  const bunnyGuid = asset?.bunny_video_guid;

  if (loading) return (
    <DashboardLayout title="Asset">
      <div className="empty-state"><span className="spinner" /></div>
    </DashboardLayout>
  );

  if (!asset) return (
    <DashboardLayout title="Asset">
      <div className="empty-state"><p>Asset not found</p></div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout title={asset.name}>
      {/* Top bar */}
      <div className="asset-topbar">
        <button className="btn-ghost" onClick={() => navigate(`/media/project/${asset.project_id}`)}>
          <ArrowLeft size={14} /> Back
        </button>

        {/* Inline name edit */}
        {editName ? (
          <div className="asset-name-edit">
            <input
              className="asset-name-input"
              value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditName(false); }}
              autoFocus
            />
            <button className="icon-btn" onClick={saveName}><Check size={14} /></button>
            <button className="icon-btn" onClick={() => setEditName(false)}><X size={14} /></button>
          </div>
        ) : (
          <button className="asset-name-btn" onClick={() => setEditName(true)}>
            {asset.name} <PencilSimple size={13} className="asset-name-edit-icon" />
          </button>
        )}

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <span className={`media-status-badge ${statusMeta.class}`}>{statusMeta.label}</span>
          <button className="btn-ghost" onClick={copyShareLink}>
            {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
            {copied ? "Copied!" : "Copy link"}
          </button>
          <button className="btn-ghost" onClick={() => setShowShare(true)}>
            Share
          </button>
          <button className="btn-ghost" onClick={() => setSidebarOpen(o => !o)} title="Toggle sidebar">
            <SidebarSimple size={14} />
          </button>
          <button className="btn-ghost danger" onClick={handleDelete}>
            <Trash size={14} />
          </button>
        </div>
      </div>

      {/* Main layout: player + sidebar */}
      <div className={`asset-layout ${sidebarOpen ? "" : "sidebar-collapsed"}`}>

        {/* LEFT — Video player */}
        <div className="asset-player-wrap">
          {bunnyGuid && asset.bunny_video_status === "ready" && asset.bunny_playback_url ? (
            <div className="asset-player">
              <iframe
                ref={iframeRef}
                src={`${asset.bunny_playback_url}?autoplay=false&loop=false&muted=false&preload=true`}
                style={{ border: "none", width: "100%", height: "100%" }}
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                allowFullScreen
                title={asset.name}
              />
            </div>
          ) : asset.bunny_video_status === "uploading" ? (
            <div className="asset-player asset-player-processing">
              <span className="spinner" />
              <p>Video is processing — check back shortly</p>
            </div>
          ) : (
            <div className="asset-player asset-player-processing">
              <p>No video preview available</p>
            </div>
          )}

          {/* Notes / description */}
          <div className="asset-notes-wrap">
            {editNotes ? (
              <div className="asset-notes-edit">
                <textarea
                  className="asset-notes-textarea"
                  value={notesVal}
                  onChange={e => setNotesVal(e.target.value)}
                  placeholder="Add notes or context for this asset…"
                  rows={4}
                  autoFocus
                />
                <div className="asset-notes-actions">
                  <button className="btn-primary-sm" onClick={saveNotes}>Save</button>
                  <button className="btn-ghost" onClick={() => { setNotesVal(asset.notes || ""); setEditNotes(false); }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button className="asset-notes-display" onClick={() => setEditNotes(true)}>
                {asset.notes
                  ? <p className="asset-notes-text">{asset.notes}</p>
                  : <span className="asset-notes-placeholder">Add notes or context… (click to edit)</span>
                }
              </button>
            )}
          </div>
        </div>

        {/* RIGHT — Tabbed sidebar */}
        <div className={`asset-sidebar ${sidebarOpen ? "" : "hidden"}`}>
          {/* Tabs */}
          <div className="asset-tabs">
            {[
              { id: "comments", icon: <ChatCircle size={15} />,           label: "Comments"  },
              { id: "versions", icon: <ClockCounterClockwise size={15} />, label: "Versions"  },
              { id: "info",     icon: <Info size={15} />,                  label: "Info"      },
            ].map(t => (
              <button
                key={t.id}
                className={`asset-tab ${tab === t.id ? "active" : ""}`}
                onClick={() => setTab(t.id)}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          <div className="asset-tab-content">
            {tab === "comments" && (
              <CommentsPanel
                assetId={assetId}
                currentTime={currentTime}
                onSeek={seekTo}
              />
            )}
            {tab === "versions" && (
              <VersionsPanel
                asset={asset}
                onVersionUploaded={newAsset => setAsset(newAsset)}
              />
            )}
            {tab === "info" && (
              <InfoPanel asset={asset} onStatusChange={changeStatus} />
            )}
          </div>
        </div>
      </div>

      {/* Share modal */}
      <AnimatePresence>
        {showShare && (
          <ShareModal asset={asset} onClose={() => setShowShare(false)} />
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}

/* ── Info panel ── */
function InfoPanel({ asset, onStatusChange }) {
  const [status, setStatus] = useState(asset.status);

  async function handleChange(val) {
    setStatus(val);
    await onStatusChange(val);
  }

  return (
    <div className="info-panel">
      <div className="info-row">
        <span className="info-label">Status</span>
        <select
          className="media-filter-select"
          value={status}
          onChange={e => handleChange(e.target.value)}
        >
          {STATUS_OPTIONS.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
      <div className="info-row">
        <span className="info-label">Type</span>
        <span className="info-value">{asset.type}</span>
      </div>
      <div className="info-row">
        <span className="info-label">Size</span>
        <span className="info-value">{asset.file_size ? formatSize(asset.file_size) : "—"}</span>
      </div>
      {asset.duration && (
        <div className="info-row">
          <span className="info-label">Duration</span>
          <span className="info-value">{formatDuration(asset.duration)}</span>
        </div>
      )}
      <div className="info-row">
        <span className="info-label">Version</span>
        <span className="info-value">v{asset.version}</span>
      </div>
      <div className="info-row">
        <span className="info-label">Uploaded</span>
        <span className="info-value">{asset.created_at ? new Date(asset.created_at).toLocaleDateString() : "—"}</span>
      </div>
      {asset.mime_type && (
        <div className="info-row">
          <span className="info-label">MIME</span>
          <span className="info-value" style={{ fontSize: 11 }}>{asset.mime_type}</span>
        </div>
      )}
    </div>
  );
}

function formatDuration(s) {
  if (!s) return "";
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
