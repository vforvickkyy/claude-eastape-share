import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  CloudArrowUp, FolderSimplePlus, SquaresFour, Rows, MagnifyingGlass,
  DotsThree, FolderOpen, VideoCamera, FileImage, File, FileAudio,
  Trash, PencilSimple, Copy, CheckCircle, X, DownloadSimple,
  CheckSquare, Square, CaretRight, House,
} from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";
import { useProject } from "./context/ProjectContext";
import UploadPanel from "./components/media/UploadPanel";
import ShareModal from "./components/media/ShareModal";
import { projectMediaApi, projectFoldersApi, shareLinksApi, formatSize } from "./lib/api";

const STATUS_COLORS = {
  in_review: { label: "In Review", class: "badge-review"   },
  approved:  { label: "Approved",  class: "badge-approved" },
  revision:  { label: "Revision",  class: "badge-revision" },
};

function typeIcon(type, mime) {
  if (type === "video" || (mime || "").startsWith("video/")) return <VideoCamera size={18} weight="duotone" />;
  if ((mime || "").startsWith("image/")) return <FileImage size={18} weight="duotone" />;
  if ((mime || "").startsWith("audio/")) return <FileAudio size={18} weight="duotone" />;
  return <File size={18} weight="duotone" />;
}

export default function ProjectMediaPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id: projectId, folderId } = useParams();
  const { project } = useProject();

  const [folders,      setFolders]      = useState([]);
  const [assets,       setAssets]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [view,         setView]         = useState("grid");
  const [search,       setSearch]       = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showUpload,   setShowUpload]   = useState(false);
  const [shareAsset,   setShareAsset]   = useState(null);
  const [copied,       setCopied]       = useState(null);
  const [renameAsset,  setRenameAsset]  = useState(null);
  const [renameVal,    setRenameVal]    = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [selected,     setSelected]    = useState(new Set());
  const [dragOver,     setDragOver]    = useState(false);
  const dropRef = useRef(null);

  const load = useCallback(() => {
    if (!user || !projectId) return;
    setLoading(true);
    setSelected(new Set());
    Promise.all([
      projectFoldersApi.list(projectId).then(d => (d.folders || []).filter(f => (f.parent_id || null) === (folderId || null))).catch(() => []),
      projectMediaApi.list({ projectId, folderId: folderId || "root" }).then(d => d.assets || d.media || []).catch(() => []),
    ]).then(([fo, as]) => {
      setFolders(fo);
      setAssets(as);
    }).finally(() => setLoading(false));
  }, [user, projectId, folderId]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id) {
    if (!confirm("Delete this asset?")) return;
    await projectMediaApi.delete(id).catch(() => {});
    setAssets(as => as.filter(a => a.id !== id));
  }

  async function handleStatusChange(id, status) {
    await projectMediaApi.update(id, { status }).catch(() => {});
    setAssets(as => as.map(a => a.id === id ? { ...a, status } : a));
  }

  async function handleRename() {
    const name = renameVal.trim();
    if (!name || name === renameAsset.name) { setRenameAsset(null); return; }
    await projectMediaApi.update(renameAsset.id, { name }).catch(() => {});
    setAssets(as => as.map(a => a.id === renameAsset.id ? { ...a, name } : a));
    setRenameAsset(null);
  }

  async function copyShareLink(asset) {
    try {
      const data = await shareLinksApi.create({ project_media_id: asset.id, allow_download: true, allow_comments: true });
      const token = data.link?.token || data.share_link?.token;
      await navigator.clipboard.writeText(`${window.location.origin}/media/share/${token}`);
      setCopied(asset.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {}
  }

  async function handleDownload(asset) {
    try {
      const { url } = await projectMediaApi.getDownloadUrl(asset.id);
      if (!url) return;
      const a = document.createElement("a"); a.href = url; a.download = asset.name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } catch {}
  }

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      const data = await projectFoldersApi.create({ name, project_id: projectId, parent_id: folderId || null });
      setFolders(fs => [...fs, data.folder]);
      setShowNewFolder(false); setNewFolderName("");
    } catch {}
  }

  async function handleBulkDelete() {
    if (!confirm(`Delete ${selected.size} selected assets?`)) return;
    await Promise.all([...selected].map(id => projectMediaApi.delete(id).catch(() => {})));
    setAssets(as => as.filter(a => !selected.has(a.id)));
    setSelected(new Set());
  }

  const filtered = assets.filter(a => {
    const matchSearch = a.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || a.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div
      className={`project-media-tab ${dragOver ? "drag-over" : ""}`}
      ref={dropRef}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); setShowUpload(true); }}
    >
      {/* Toolbar */}
      <div className="mpv-toolbar">
        <div className="mpv-search-wrap">
          <MagnifyingGlass size={14} />
          <input
            className="mpv-search"
            placeholder="Search media…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="mpv-filter-select"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="all">All Statuses</option>
          <option value="in_review">In Review</option>
          <option value="approved">Approved</option>
          <option value="revision">Revision</option>
        </select>
        <button className={`icon-btn ${view === "grid" ? "active" : ""}`} onClick={() => setView("grid")} title="Grid">
          <SquaresFour size={16} weight="duotone" />
        </button>
        <button className={`icon-btn ${view === "list" ? "active" : ""}`} onClick={() => setView("list")} title="List">
          <Rows size={16} weight="duotone" />
        </button>
        <button className="icon-btn" onClick={() => setShowNewFolder(true)} title="New Folder">
          <FolderSimplePlus size={17} weight="duotone" />
        </button>
        <button className="btn-primary" onClick={() => setShowUpload(true)}>
          <CloudArrowUp size={14} weight="bold" />
          Upload
        </button>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="mpv-bulk-bar">
          <span>{selected.size} selected</span>
          <button className="btn-danger-sm" onClick={handleBulkDelete}>
            <Trash size={13} /> Delete
          </button>
          <button className="btn-ghost-sm" onClick={() => setSelected(new Set())}>
            <X size={13} /> Clear
          </button>
        </div>
      )}

      {/* Breadcrumb */}
      {folderId && (
        <div className="mpv-breadcrumb">
          <button onClick={() => navigate(`/projects/${projectId}/media`)}>
            <House size={13} /> Root
          </button>
          <CaretRight size={11} />
          <span>Folder</span>
        </div>
      )}

      {loading ? (
        <div className="mpv-loading">Loading…</div>
      ) : (
        <>
          {/* Folders */}
          {folders.length > 0 && (
            <div className="mpv-folders-row">
              {folders.map(f => (
                <div
                  key={f.id}
                  className="mpv-folder-chip"
                  onClick={() => navigate(`/projects/${projectId}/media/folder/${f.id}`)}
                >
                  <FolderOpen size={15} weight="duotone" />
                  <span>{f.name}</span>
                </div>
              ))}
            </div>
          )}

          {/* New folder inline */}
          {showNewFolder && (
            <div className="mpv-new-folder-row">
              <FolderOpen size={15} weight="duotone" />
              <input
                autoFocus
                className="mpv-folder-input"
                placeholder="Folder name"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") createFolder(); if (e.key === "Escape") setShowNewFolder(false); }}
              />
              <button className="icon-btn" onClick={createFolder}><CheckCircle size={15} /></button>
              <button className="icon-btn" onClick={() => setShowNewFolder(false)}><X size={14} /></button>
            </div>
          )}

          {/* Empty state */}
          {filtered.length === 0 && (
            <div className="mpv-empty">
              <VideoCamera size={48} weight="duotone" style={{ opacity: 0.2 }} />
              <p>{search || filterStatus !== "all" ? "No assets match your filters." : "No media yet. Upload your first file."}</p>
              {!search && filterStatus === "all" && (
                <button className="btn-primary" onClick={() => setShowUpload(true)}>
                  <CloudArrowUp size={14} weight="bold" /> Upload
                </button>
              )}
            </div>
          )}

          {/* Grid */}
          {view === "grid" && filtered.length > 0 && (
            <div className="mpv-grid">
              {filtered.map(asset => (
                <motion.div
                  key={asset.id}
                  className={`mpv-card ${selected.has(asset.id) ? "selected" : ""}`}
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  <div
                    className="mpv-card-thumb"
                    onClick={() => navigate(`/projects/${projectId}/media/${asset.id}`)}
                  >
                    {asset.thumbnailUrl ? (
                      <img src={asset.thumbnailUrl} alt={asset.name} onError={e => { e.target.style.display = "none"; }} />
                    ) : (
                      <div className="mpv-card-icon">{typeIcon(asset.type, asset.mime_type)}</div>
                    )}
                    {asset.duration && (
                      <span className="mpv-card-duration">
                        {Math.floor(asset.duration / 60)}:{String(Math.round(asset.duration % 60)).padStart(2, "0")}
                      </span>
                    )}
                    {asset.status && STATUS_COLORS[asset.status] && (
                      <span className={`media-status-badge ${STATUS_COLORS[asset.status].class}`}>
                        {STATUS_COLORS[asset.status].label}
                      </span>
                    )}
                    {asset.wasabi_status === "processing" && (
                      <span className="mpv-card-processing">Processing…</span>
                    )}
                  </div>
                  <div className="mpv-card-footer">
                    <button
                      className="mpv-card-select"
                      onClick={e => { e.stopPropagation(); setSelected(s => { const n = new Set(s); n.has(asset.id) ? n.delete(asset.id) : n.add(asset.id); return n; }); }}
                    >
                      {selected.has(asset.id) ? <CheckSquare size={14} /> : <Square size={14} />}
                    </button>
                    {renameAsset?.id === asset.id ? (
                      <input
                        className="mpv-rename-input"
                        value={renameVal}
                        onChange={e => setRenameVal(e.target.value)}
                        onBlur={handleRename}
                        onKeyDown={e => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setRenameAsset(null); }}
                        autoFocus
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <span className="mpv-card-name" title={asset.name}>{asset.name}</span>
                    )}
                    <div className="mpv-card-actions">
                      <button title="Copy share link" onClick={() => copyShareLink(asset)}>
                        {copied === asset.id ? <CheckCircle size={13} /> : <Copy size={13} />}
                      </button>
                      <button title="Download" onClick={() => handleDownload(asset)}>
                        <DownloadSimple size={13} />
                      </button>
                      <button title="Rename" onClick={() => { setRenameAsset(asset); setRenameVal(asset.name); }}>
                        <PencilSimple size={13} />
                      </button>
                      <button title="Delete" onClick={() => handleDelete(asset.id)}>
                        <Trash size={13} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* List */}
          {view === "list" && filtered.length > 0 && (
            <div className="mpv-list">
              <div className="mpv-list-header">
                <span>Name</span><span>Type</span><span>Status</span><span>Size</span><span />
              </div>
              {filtered.map(asset => (
                <div
                  key={asset.id}
                  className={`mpv-list-row ${selected.has(asset.id) ? "selected" : ""}`}
                  onClick={() => navigate(`/projects/${projectId}/media/${asset.id}`)}
                >
                  <span className="mpv-list-name">
                    {typeIcon(asset.type, asset.mime_type)}
                    {asset.name}
                  </span>
                  <span>{asset.type || "—"}</span>
                  <span>
                    {asset.status && STATUS_COLORS[asset.status] ? (
                      <span className={`media-status-badge ${STATUS_COLORS[asset.status].class}`}>
                        {STATUS_COLORS[asset.status].label}
                      </span>
                    ) : "—"}
                  </span>
                  <span>{asset.file_size ? formatSize(asset.file_size) : "—"}</span>
                  <span onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => copyShareLink(asset)}>
                      {copied === asset.id ? <CheckCircle size={13} /> : <Copy size={13} />}
                    </button>
                    <button onClick={() => handleDownload(asset)}><DownloadSimple size={13} /></button>
                    <button onClick={() => handleDelete(asset.id)}><Trash size={13} /></button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Upload Panel */}
      {showUpload && (
        <UploadPanel
          projectId={projectId}
          folderId={folderId}
          onClose={() => setShowUpload(false)}
          onUploaded={() => { setShowUpload(false); load(); }}
        />
      )}

      {/* Share Modal */}
      {shareAsset && (
        <ShareModal
          asset={shareAsset}
          onClose={() => setShareAsset(null)}
        />
      )}
    </div>
  );
}
