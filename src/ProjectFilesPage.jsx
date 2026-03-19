import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  UploadSimple, FolderSimplePlus, MagnifyingGlass, Rows, SquaresFour,
  File, FileVideo, FileImage, FileAudio, FolderOpen,
  Trash, PencilSimple, DownloadSimple, CheckCircle, X,
  CaretRight, House, Play, ArrowLeft, ArrowRight,
  CheckSquare, Square, Copy, Tag, CaretRight as ChevronRight,
} from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";
import { useProject } from "./context/ProjectContext";
import { projectMediaApi, projectFilesApi, projectFoldersApi, shareLinksApi, formatSize } from "./lib/api";
import UploadPanel from "./components/media/UploadPanel";

const STATUS_COLORS = {
  in_review: { label: "In Review", class: "badge-review"    },
  approved:  { label: "Approved",  class: "badge-approved"  },
  revision:  { label: "Revision",  class: "badge-revision"  },
};

const STATUS_OPTS = [
  { value: "in_review", label: "In Review" },
  { value: "approved",  label: "Approved"  },
  { value: "revision",  label: "Revision"  },
];

const TYPE_FILTERS = [
  { key: "all",      label: "All" },
  { key: "video",    label: "Video" },
  { key: "image",    label: "Image" },
  { key: "audio",    label: "Audio" },
  { key: "document", label: "Document" },
];

function getType(item) {
  const mime = (item.mime_type || "").toLowerCase();
  if (mime.startsWith("video/") || item.type === "video") return "video";
  if (mime.startsWith("image/") || item.type === "image") return "image";
  if (mime.startsWith("audio/") || item.type === "audio") return "audio";
  return "document";
}

function TypeIcon({ item, size = 18 }) {
  const t = getType(item);
  if (t === "video") return <FileVideo size={size} weight="duotone" style={{ color: "#a78bfa" }} />;
  if (t === "image") return <FileImage size={size} weight="duotone" style={{ color: "#60a5fa" }} />;
  if (t === "audio") return <FileAudio size={size} weight="duotone" style={{ color: "#34d399" }} />;
  return <File size={size} weight="duotone" style={{ color: "var(--t3)" }} />;
}

export default function ProjectFilesPage() {
  const { user } = useAuth();
  const { isOwner } = useProject();
  const navigate = useNavigate();
  const { id: projectId, folderId } = useParams();

  const [items,         setItems]         = useState([]);
  const [folders,       setFolders]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState("");
  const [typeFilter,    setTypeFilter]    = useState("all");
  const [view,          setView]          = useState("grid");
  const [showUpload,    setShowUpload]    = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [selected,      setSelected]      = useState(new Set());
  const [renameItem,    setRenameItem]    = useState(null);   // { id, name, _type: 'file'|'folder' }
  const [renameVal,     setRenameVal]     = useState("");
  const [copied,        setCopied]        = useState(null);

  // Context menu
  const [ctxMenu, setCtxMenu] = useState(null); // { x, y, item, isFolder }
  const [statusSub, setStatusSub] = useState(false);
  const ctxRef = useRef(null);

  // Preview state
  const [preview,        setPreview]        = useState(null);
  const [previewUrl,     setPreviewUrl]     = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const videoRef = useRef(null);

  const load = useCallback(() => {
    if (!user || !projectId) return;
    setLoading(true);
    setSelected(new Set());
    const fd = folderId || null;
    Promise.all([
      projectFoldersApi.list(projectId)
        .then(d => (d.folders || []).filter(f => (f.parent_id || null) === fd))
        .catch(() => []),
      projectMediaApi.list({ projectId, folderId: folderId || "root" })
        .then(d => (d.assets || []).map(a => ({ ...a, _source: "media" })))
        .catch(() => []),
      projectFilesApi.list({ projectId, folderId: folderId || "root" })
        .then(d => (d.files || []).map(f => ({ ...f, _source: "file" })))
        .catch(() => []),
    ]).then(([fo, media, files]) => {
      setFolders(fo);
      const merged = [...media, ...files].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );
      setItems(merged);
    }).finally(() => setLoading(false));
  }, [user, projectId, folderId]);

  useEffect(() => { load(); }, [load]);

  // Close context menu on outside click / scroll
  useEffect(() => {
    function close() { setCtxMenu(null); setStatusSub(false); }
    document.addEventListener("click", close);
    document.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("scroll", close, true);
    };
  }, []);

  function openCtxMenu(e, item, isFolder = false) {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 200);
    const y = Math.min(e.clientY, window.innerHeight - 250);
    setCtxMenu({ x, y, item, isFolder });
    setStatusSub(false);
  }

  function closeCtx() { setCtxMenu(null); setStatusSub(false); }

  // Preview
  async function openPreview(item) {
    const t = getType(item);
    if (t === "document") { handleDownload(item); return; }
    if (item._source === "media") {
      navigate(`/projects/${projectId}/media/${item.id}`);
      return;
    }
    setPreview(item);
    setPreviewUrl(null);
    setPreviewLoading(true);
    try {
      const d = await projectFilesApi.getDownloadUrl(item.id);
      setPreviewUrl(d.url);
    } catch { setPreviewUrl(null); }
    setPreviewLoading(false);
  }

  function closePreview() { setPreview(null); setPreviewUrl(null); }

  const previewable = items.filter(i => getType(i) !== "document");
  function previewNav(dir) {
    const idx = previewable.findIndex(i => i.id === preview?.id);
    const next = previewable[idx + dir];
    if (next) openPreview(next);
  }

  // File actions
  async function handleDelete(item) {
    if (!confirm(`Delete "${item.name}"?`)) return;
    if (item._source === "media") await projectMediaApi.delete(item.id).catch(() => {});
    else await projectFilesApi.delete(item.id).catch(() => {});
    setItems(prev => prev.filter(i => i.id !== item.id));
    if (preview?.id === item.id) closePreview();
  }

  async function handleFolderDelete(folder) {
    if (!confirm(`Delete folder "${folder.name}" and all its contents?`)) return;
    await projectFoldersApi.delete(folder.id).catch(() => {});
    setFolders(prev => prev.filter(f => f.id !== folder.id));
  }

  async function handleDownload(item) {
    try {
      let url;
      if (item._source === "media") {
        const d = await projectMediaApi.getDownloadUrl(item.id);
        url = d.url;
      } else {
        const d = await projectFilesApi.getDownloadUrl(item.id);
        url = d.url;
      }
      if (!url) return;
      const a = document.createElement("a"); a.href = url; a.download = item.name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } catch {}
  }

  async function handleRename() {
    const name = renameVal.trim();
    if (!name) { setRenameItem(null); return; }
    if (renameItem._type === "folder") {
      if (name !== renameItem.name) {
        await projectFoldersApi.update(renameItem.id, { name }).catch(() => {});
        setFolders(prev => prev.map(f => f.id === renameItem.id ? { ...f, name } : f));
      }
    } else {
      if (name !== renameItem.name) {
        if (renameItem._source === "media") await projectMediaApi.update(renameItem.id, { name }).catch(() => {});
        else await projectFilesApi.update(renameItem.id, { name }).catch(() => {});
        setItems(prev => prev.map(i => i.id === renameItem.id ? { ...i, name } : i));
      }
    }
    setRenameItem(null);
  }

  async function handleStatusChange(item, status) {
    await projectMediaApi.update(item.id, { status }).catch(() => {});
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status } : i));
    closeCtx();
  }

  async function handleCopyLink(item) {
    try {
      const data = await shareLinksApi.create({ project_media_id: item.id, allow_download: true, allow_comments: true });
      const token = data.link?.token || data.share_link?.token;
      await navigator.clipboard.writeText(`${window.location.origin}/media/share/${token}`);
      setCopied(item.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {}
    closeCtx();
  }

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    const d = await projectFoldersApi.create({ name, project_id: projectId, parent_id: folderId || null }).catch(() => null);
    if (d?.folder) setFolders(fs => [...fs, d.folder]);
    setShowNewFolder(false); setNewFolderName("");
  }

  async function handleBulkDelete() {
    if (!confirm(`Delete ${selected.size} items?`)) return;
    await Promise.all([...selected].map(id => {
      const item = items.find(i => i.id === id);
      if (!item) return;
      return item._source === "media"
        ? projectMediaApi.delete(id).catch(() => {})
        : projectFilesApi.delete(id).catch(() => {});
    }));
    setItems(prev => prev.filter(i => !selected.has(i.id)));
    setSelected(new Set());
  }

  const filtered = items.filter(item => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (typeFilter !== "all" && getType(item) !== typeFilter) return false;
    return true;
  });

  function toggleSelect(id, e) {
    e.stopPropagation();
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  return (
    <div className="ufiles-page" onClick={closeCtx}>
      {/* Toolbar */}
      <div className="ufiles-toolbar">
        <div className="ufiles-search-wrap">
          <MagnifyingGlass size={14} />
          <input
            className="ufiles-search"
            placeholder="Search files…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="ufiles-toolbar-right">
          <button className={`icon-btn ${view === "grid" ? "active" : ""}`} onClick={() => setView("grid")} title="Grid"><SquaresFour size={16} weight="duotone" /></button>
          <button className={`icon-btn ${view === "list" ? "active" : ""}`} onClick={() => setView("list")} title="List"><Rows size={16} weight="duotone" /></button>
          <button className="icon-btn" onClick={() => setShowNewFolder(true)} title="New Folder"><FolderSimplePlus size={17} weight="duotone" /></button>
          <button className="ufiles-upload-btn" onClick={() => setShowUpload(true)}>
            <UploadSimple size={15} weight="bold" />
            Upload
          </button>
        </div>
      </div>

      {/* Type filter pills */}
      <div className="ufiles-type-pills">
        {TYPE_FILTERS.map(tf => (
          <button
            key={tf.key}
            className={`ufiles-type-pill ${typeFilter === tf.key ? "active" : ""}`}
            onClick={() => setTypeFilter(tf.key)}
          >
            {tf.label}
          </button>
        ))}
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="mpv-bulk-bar">
          <span>{selected.size} selected</span>
          <button className="btn-danger-sm" onClick={handleBulkDelete}><Trash size={13} /> Delete</button>
          <button className="btn-ghost-sm" onClick={() => setSelected(new Set())}><X size={13} /> Clear</button>
        </div>
      )}

      {/* Breadcrumb */}
      {folderId && (
        <div className="mpv-breadcrumb">
          <button onClick={() => navigate(`/projects/${projectId}/files`)}><House size={13} /> Root</button>
          <CaretRight size={11} />
          <span>Folder</span>
        </div>
      )}

      {loading ? (
        <div className="mpv-loading">Loading…</div>
      ) : (
        <>
          {/* New folder inline input */}
          {showNewFolder && (
            <div className="mpv-new-folder-row">
              <FolderOpen size={15} weight="duotone" />
              <input
                autoFocus className="mpv-folder-input" placeholder="Folder name"
                value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") createFolder(); if (e.key === "Escape") setShowNewFolder(false); }}
              />
              <button className="icon-btn" onClick={createFolder}><CheckCircle size={15} /></button>
              <button className="icon-btn" onClick={() => setShowNewFolder(false)}><X size={14} /></button>
            </div>
          )}

          {/* Empty state */}
          {filtered.length === 0 && folders.length === 0 && (
            <div className="mpv-empty">
              <UploadSimple size={48} weight="duotone" style={{ opacity: 0.2 }} />
              <p>{search || typeFilter !== "all" ? "No files match your filters." : "No files yet. Upload your first file."}</p>
              {!search && typeFilter === "all" && (
                <button className="ufiles-upload-btn" onClick={() => setShowUpload(true)}>
                  <UploadSimple size={14} weight="bold" /> Upload Files
                </button>
              )}
            </div>
          )}

          {/* Grid view — folders + files in one unified grid */}
          {view === "grid" && (
            <div className="ufiles-grid">
              {/* Folder cards */}
              {folders.map(folder => (
                <motion.div
                  key={`folder-${folder.id}`}
                  className="ufile-card ufile-folder-card"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={() => navigate(`/projects/${projectId}/files/folder/${folder.id}`)}
                  onContextMenu={e => openCtxMenu(e, folder, true)}
                >
                  <div className="ufile-thumb ufile-folder-thumb">
                    {renameItem?.id === folder.id && renameItem._type === "folder" ? (
                      <input
                        className="ufile-folder-rename"
                        value={renameVal}
                        onChange={e => setRenameVal(e.target.value)}
                        onBlur={handleRename}
                        onKeyDown={e => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setRenameItem(null); }}
                        autoFocus
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <FolderOpen size={44} weight="duotone" style={{ color: "#f59e0b" }} />
                    )}
                  </div>
                  <div className="ufile-footer">
                    <div className="ufile-footer-top">
                      <span className="ufile-name" title={folder.name}>{folder.name}</span>
                    </div>
                    <div className="ufile-meta">Folder</div>
                  </div>
                </motion.div>
              ))}

              {/* File cards */}
              {filtered.map(item => {
                const t = getType(item);
                const canPreview = t !== "document";
                const isSelected = selected.has(item.id);
                const status = item.status && STATUS_COLORS[item.status];
                return (
                  <motion.div
                    key={item.id}
                    className={`ufile-card ${isSelected ? "selected" : ""}`}
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onContextMenu={e => openCtxMenu(e, item, false)}
                  >
                    <div className="ufile-thumb" onClick={() => canPreview ? openPreview(item) : handleDownload(item)}>
                      {item.thumbnailUrl ? (
                        <img src={item.thumbnailUrl} alt={item.name} onError={e => { e.target.style.display = "none"; }} />
                      ) : (
                        <div className="ufile-thumb-icon"><TypeIcon item={item} size={40} /></div>
                      )}
                      {t === "video" && (
                        <div className="ufile-play-overlay">
                          <div className="ufile-play-btn"><Play size={18} weight="fill" /></div>
                        </div>
                      )}
                      {item.duration && (
                        <span className="mpv-card-duration">
                          {Math.floor(item.duration / 60)}:{String(Math.round(item.duration % 60)).padStart(2, "0")}
                        </span>
                      )}
                      {status && (
                        <span className={`media-status-badge ${status.class}`}>{status.label}</span>
                      )}
                    </div>
                    <div className="ufile-footer">
                      <div className="ufile-footer-top">
                        <button className="ufile-select-btn" onClick={e => toggleSelect(item.id, e)}>
                          {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                        </button>
                        {renameItem?.id === item.id && renameItem._type !== "folder" ? (
                          <input
                            className="mpv-rename-input"
                            value={renameVal}
                            onChange={e => setRenameVal(e.target.value)}
                            onBlur={handleRename}
                            onKeyDown={e => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setRenameItem(null); }}
                            autoFocus onClick={e => e.stopPropagation()}
                          />
                        ) : (
                          <span className="ufile-name" title={item.name}>{item.name}</span>
                        )}
                      </div>
                      <div className="ufile-meta">
                        {item.file_size ? formatSize(item.file_size) : ""}
                        {item.file_size && item.created_at ? " · " : ""}
                        {item.created_at ? new Date(item.created_at).toLocaleDateString() : ""}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* List view */}
          {view === "list" && (
            <div className="mpv-list">
              <div className="mpv-list-header">
                <span>Name</span><span>Type</span><span>Size</span><span>Added</span><span />
              </div>
              {folders.map(folder => (
                <div
                  key={`folder-${folder.id}`}
                  className="mpv-list-row"
                  onClick={() => navigate(`/projects/${projectId}/files/folder/${folder.id}`)}
                  onContextMenu={e => openCtxMenu(e, folder, true)}
                >
                  <span className="mpv-list-name">
                    <FolderOpen size={15} weight="duotone" style={{ color: "#f59e0b" }} />
                    {folder.name}
                  </span>
                  <span>Folder</span>
                  <span>—</span>
                  <span>{folder.created_at ? new Date(folder.created_at).toLocaleDateString() : "—"}</span>
                  <span />
                </div>
              ))}
              {filtered.map(item => {
                const t = getType(item);
                const status = item.status && STATUS_COLORS[item.status];
                return (
                  <div
                    key={item.id}
                    className="mpv-list-row"
                    onClick={() => t !== "document" ? openPreview(item) : handleDownload(item)}
                    onContextMenu={e => openCtxMenu(e, item, false)}
                  >
                    <span className="mpv-list-name">
                      <TypeIcon item={item} size={15} />
                      {item.name}
                      {status && <span className={`media-status-badge ${status.class}`} style={{ position: "static", marginLeft: 6 }}>{status.label}</span>}
                    </span>
                    <span style={{ textTransform: "capitalize" }}>{t}</span>
                    <span>{item.file_size ? formatSize(item.file_size) : "—"}</span>
                    <span>{item.created_at ? new Date(item.created_at).toLocaleDateString() : "—"}</span>
                    <span style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => handleDownload(item)}><DownloadSimple size={14} /></button>
                      <button onClick={() => { setRenameItem({ ...item, _type: "file" }); setRenameVal(item.name); }}><PencilSimple size={14} /></button>
                      <button onClick={() => handleDelete(item)}><Trash size={14} /></button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Context Menu ── */}
      {ctxMenu && (
        <div
          ref={ctxRef}
          className="ctx-menu"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
          onClick={e => e.stopPropagation()}
          onContextMenu={e => e.preventDefault()}
        >
          {ctxMenu.isFolder ? (
            <>
              <button onClick={() => { navigate(`/projects/${projectId}/files/folder/${ctxMenu.item.id}`); closeCtx(); }}>
                <FolderOpen size={13} /> Open
              </button>
              <button onClick={() => { setRenameItem({ ...ctxMenu.item, _type: "folder" }); setRenameVal(ctxMenu.item.name); closeCtx(); }}>
                <PencilSimple size={13} /> Rename
              </button>
              <div className="ctx-divider" />
              <button className="danger" onClick={() => { handleFolderDelete(ctxMenu.item); closeCtx(); }}>
                <Trash size={13} /> Delete
              </button>
            </>
          ) : (
            <>
              {getType(ctxMenu.item) !== "document" && (
                <button onClick={() => { openPreview(ctxMenu.item); closeCtx(); }}>
                  <Play size={13} /> Preview
                </button>
              )}
              <button onClick={() => { handleDownload(ctxMenu.item); closeCtx(); }}>
                <DownloadSimple size={13} /> Download
              </button>
              <button onClick={() => { setRenameItem({ ...ctxMenu.item, _type: "file" }); setRenameVal(ctxMenu.item.name); closeCtx(); }}>
                <PencilSimple size={13} /> Rename
              </button>
              {ctxMenu.item._source === "media" && (
                <>
                  <button onClick={() => handleCopyLink(ctxMenu.item)}>
                    {copied === ctxMenu.item.id ? <CheckCircle size={13} /> : <Copy size={13} />}
                    {copied === ctxMenu.item.id ? "Copied!" : "Copy Link"}
                  </button>
                  <div className="ctx-divider" />
                  <div
                    className="ctx-submenu-wrap"
                    onMouseEnter={() => setStatusSub(true)}
                    onMouseLeave={() => setStatusSub(false)}
                  >
                    <button className="ctx-has-sub">
                      <Tag size={13} /> Set Status
                      <ChevronRight size={11} style={{ marginLeft: "auto" }} />
                    </button>
                    {statusSub && (
                      <div className="ctx-submenu">
                        {STATUS_OPTS.map(opt => (
                          <button
                            key={opt.value}
                            className={ctxMenu.item.status === opt.value ? "active" : ""}
                            onClick={() => handleStatusChange(ctxMenu.item, opt.value)}
                          >
                            <span className={`ctx-status-dot status-${opt.value}`} />
                            {opt.label}
                            {ctxMenu.item.status === opt.value && <CheckCircle size={11} style={{ marginLeft: "auto" }} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
              <div className="ctx-divider" />
              <button className="danger" onClick={() => { handleDelete(ctxMenu.item); closeCtx(); }}>
                <Trash size={13} /> Delete
              </button>
            </>
          )}
        </div>
      )}

      {/* Upload panel */}
      <AnimatePresence>
        {showUpload && (
          <UploadPanel
            projectId={projectId}
            folderId={folderId}
            onClose={() => setShowUpload(false)}
            onUploaded={() => { setShowUpload(false); load(); }}
          />
        )}
      </AnimatePresence>

      {/* Preview modal */}
      <AnimatePresence>
        {preview && (
          <motion.div
            className="preview-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={closePreview}
          >
            <motion.div
              className="preview-inner"
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <button className="preview-close" onClick={closePreview}><X size={22} /></button>
              <div className="preview-media">
                {previewLoading && <div className="preview-spinner" />}
                {!previewLoading && previewUrl && (() => {
                  const t = getType(preview);
                  if (t === "video") return <video ref={videoRef} key={previewUrl} controls autoPlay className="preview-video" src={previewUrl} />;
                  if (t === "image") return <img className="preview-image" src={previewUrl} alt={preview.name} />;
                  if (t === "audio") return (
                    <div className="preview-audio-wrap">
                      <FileAudio size={64} weight="duotone" style={{ color: "#34d399", opacity: 0.8 }} />
                      <audio controls autoPlay src={previewUrl} style={{ marginTop: 16, width: "100%", maxWidth: 400 }} />
                    </div>
                  );
                  return null;
                })()}
                {!previewLoading && !previewUrl && <div className="preview-error">Failed to load preview</div>}
              </div>
              <div className="preview-info">
                <span className="preview-name">{preview.name}</span>
                {preview.file_size && <span className="preview-size">{formatSize(preview.file_size)}</span>}
                <button className="preview-dl-btn" onClick={() => handleDownload(preview)}>
                  <DownloadSimple size={14} /> Download
                </button>
              </div>
              {previewable.length > 1 && (
                <>
                  <button className="preview-nav prev" onClick={() => previewNav(-1)}><ArrowLeft size={20} /></button>
                  <button className="preview-nav next" onClick={() => previewNav(1)}><ArrowRight size={20} /></button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
