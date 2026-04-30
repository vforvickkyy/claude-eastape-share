import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  UploadSimple, FolderSimplePlus, MagnifyingGlass, Rows, SquaresFour,
  File, FileVideo, FileImage, FileAudio, FolderOpen, FolderSimple,
  Trash, PencilSimple, DownloadSimple, CheckCircle, X,
  CaretRight, House, Play, ArrowLeft, ArrowRight,
  CheckSquare, Square, Copy, Tag, CaretRight as ChevronRight,
  ArrowsDownUp, ArrowUp, ArrowDown, CloudArrowUp,
} from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";
import { useProject } from "./context/ProjectContext";
import { projectMediaApi, projectFilesApi, projectFoldersApi, shareLinksApi, formatSize } from "./lib/api";
import { useUpload } from "./context/UploadContext";
import { uploadMediaFile, ingestToCloudflare } from "./lib/mediaUpload";

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

const SORT_FIELDS = [
  { key: "created_at", label: "Date" },
  { key: "name",       label: "Name" },
  { key: "size",       label: "Size" },
  { key: "type",       label: "Type" },
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

function sortItems(items, field, dir) {
  return [...items].sort((a, b) => {
    let va, vb;
    if (field === "name")  { va = (a.name || "").toLowerCase(); vb = (b.name || "").toLowerCase(); }
    else if (field === "size") { va = a.file_size || 0; vb = b.file_size || 0; }
    else if (field === "type") { va = getType(a); vb = getType(b); }
    else { va = new Date(a.created_at || 0).getTime(); vb = new Date(b.created_at || 0).getTime(); }
    if (va < vb) return dir === "asc" ? -1 : 1;
    if (va > vb) return dir === "asc" ? 1 : -1;
    return 0;
  });
}

export default function ProjectFilesPage() {
  const { user } = useAuth();
  const { canEdit, canDelete, canDownload } = useProject();
  const { addCustomUpload } = useUpload();
  const navigate = useNavigate();
  const location = useLocation();
  const { id: projectId, folderId } = useParams();

  const [items,         setItems]         = useState([]);
  const [folders,       setFolders]       = useState([]);
  const [allFolders,    setAllFolders]    = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState("");
  const [typeFilter,    setTypeFilter]    = useState("all");
  const [view,          setView]          = useState("grid");
  const [isDragOver,    setIsDragOver]    = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [selected,      setSelected]      = useState(new Set());
  const [renameItem,    setRenameItem]    = useState(null);
  const [renameVal,     setRenameVal]     = useState("");
  const [copied,        setCopied]        = useState(null);

  // Sort — persisted in localStorage
  const [sortField,     setSortField]     = useState(() => { try { return localStorage.getItem("pf_sort_field") || "name" } catch { return "name" } });
  const [sortDir,       setSortDir]       = useState(() => { try { return localStorage.getItem("pf_sort_dir")  || "asc"  } catch { return "asc"  } });
  const [showSortMenu,  setShowSortMenu]  = useState(false);

  // Drag-to-folder
  const [draggingItem,    setDraggingItem]    = useState(null); // { id, item, isFolder }
  const [dragOverFolder,  setDragOverFolder]  = useState(null); // folder id being hovered

  // Context menu (item)
  const [ctxMenu,   setCtxMenu]   = useState(null);
  const [statusSub, setStatusSub] = useState(false);
  const [moveSub,   setMoveSub]   = useState(false);
  const ctxRef = useRef(null);

  // Background right-click context menu
  const [bgCtxMenu, setBgCtxMenu] = useState(null);

  // Preview state
  const [preview,        setPreview]        = useState(null);
  const [previewUrl,     setPreviewUrl]     = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const videoRef = useRef(null);

  // File input ref + CF ingest queue
  const fileInputRef = useRef(null);
  const cfQueue      = useRef([]);
  const cfRunning    = useRef(false);

  // Rubber-band selection
  const [rubberBand, setRubberBand] = useState(null); // { x, y, w, h } in viewport coords
  const rbStart     = useRef(null);
  const gridRef     = useRef(null);

  const load = useCallback(() => {
    if (!user || !projectId) return;
    setLoading(true);
    setSelected(new Set());
    const fd = folderId || null;
    Promise.all([
      projectFoldersApi.list(projectId)
        .then(d => {
          const all = d.folders || [];
          setAllFolders(all);
          return all.filter(f => (f.parent_id || null) === fd);
        })
        .catch(() => []),
      projectMediaApi.list({ projectId, folderId: folderId || "root" })
        .then(d => (d.assets || []).map(a => ({ ...a, _source: "media" })))
        .catch(() => []),
      projectFilesApi.list({ projectId, folderId: folderId || "root" })
        .then(d => (d.files || []).map(f => ({ ...f, _source: "file" })))
        .catch(() => []),
    ]).then(([fo, media, files]) => {
      setFolders(fo);
      setItems([...media, ...files]);
    }).finally(() => setLoading(false));
  }, [user, projectId, folderId]);

  useEffect(() => { load(); }, [load]);

  // ── Upload files via Drive-style queue panel ─────────────────────────
  const handleUploadFiles = useCallback((files) => {
    async function runCfQueue() {
      if (cfRunning.current) return;
      cfRunning.current = true;
      while (cfQueue.current.length > 0) {
        const assetId = cfQueue.current.shift();
        try { await ingestToCloudflare(assetId); } catch {}
        if (cfQueue.current.length > 0) await new Promise(r => setTimeout(r, 800));
      }
      cfRunning.current = false;
    }
    Array.from(files).forEach(file => {
      addCustomUpload(file.name, file.size, async (onProgress) => {
        const asset = await uploadMediaFile(file, projectId, folderId, onProgress);
        load();
        if (file.type.startsWith("video/") && asset?.id) {
          cfQueue.current.push(asset.id);
          runCfQueue();
        }
      });
    });
  }, [addCustomUpload, projectId, folderId, load]);

  // Window-level drag-and-drop (OS file drops only, not internal item drags)
  useEffect(() => {
    const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).some(t => t.toLowerCase() === "files");
    const dragCount = { n: 0 };
    function onEnter(e) { if (!hasFiles(e)) return; e.preventDefault(); dragCount.n++; setIsDragOver(true); }
    function onLeave(e) { if (!hasFiles(e)) return; e.preventDefault(); dragCount.n--; if (dragCount.n <= 0) { dragCount.n = 0; setIsDragOver(false); } }
    function onOver(e)  { if (hasFiles(e)) e.preventDefault(); }
    function onDrop(e)  {
      if (!hasFiles(e)) return;
      e.preventDefault(); dragCount.n = 0; setIsDragOver(false);
      if (canEdit && e.dataTransfer.files?.length) handleUploadFiles(e.dataTransfer.files);
    }
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover",  onOver);
    window.addEventListener("drop",      onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover",  onOver);
      window.removeEventListener("drop",      onDrop);
    };
  }, [canEdit, handleUploadFiles]);

  useEffect(() => {
    function close() { setCtxMenu(null); setStatusSub(false); setMoveSub(false); setShowSortMenu(false); setBgCtxMenu(null); }
    document.addEventListener("click", close);
    document.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("scroll", close, true);
    };
  }, []);

  function handleGridContextMenu(e) {
    if (e.target.closest(".ufile-card, .ctx-menu, button, input, a")) return;
    e.preventDefault();
    const x = Math.min(e.clientX, window.innerWidth - 180);
    const y = Math.min(e.clientY, window.innerHeight - 160);
    setBgCtxMenu({ x, y });
  }

  function openCtxMenu(e, item, isFolder = false) {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = Math.min(e.clientY, window.innerHeight - 320);
    setCtxMenu({ x, y, item, isFolder });
    setStatusSub(false);
    setMoveSub(false);
  }

  function closeCtx() { setCtxMenu(null); setStatusSub(false); setMoveSub(false); }

  // ── Sort ────────────────────────────────────────────────────────────
  function handleSortField(field) {
    let newDir;
    if (sortField === field) {
      newDir = sortDir === "asc" ? "desc" : "asc";
      setSortDir(newDir);
    } else {
      newDir = field === "created_at" ? "desc" : "asc";
      setSortField(field);
      setSortDir(newDir);
    }
    try { localStorage.setItem("pf_sort_field", sortField === field ? sortField : field); } catch {}
    try { localStorage.setItem("pf_sort_dir", newDir); } catch {}
    setShowSortMenu(false);
  }

  // ── Move to folder ──────────────────────────────────────────────────
  async function handleMoveToFolder(item, targetFolderId, isFolder = false) {
    try {
      if (isFolder) {
        if (item.id === targetFolderId) return;
        await projectFoldersApi.update(item.id, { parent_id: targetFolderId || null });
      } else {
        if (item._source === "media") await projectMediaApi.update(item.id, { folder_id: targetFolderId || null });
        else await projectFilesApi.update(item.id, { folder_id: targetFolderId || null });
      }
      load();
    } catch {}
    closeCtx();
  }

  // ── Drag-to-folder ──────────────────────────────────────────────────
  function handleDragStart(e, item, isFolder = false) {
    e.dataTransfer.effectAllowed = "move";
    setDraggingItem({ id: item.id, item, isFolder });
  }

  function handleDragEnd() {
    setDraggingItem(null);
    setDragOverFolder(null);
  }

  function handleFolderDragOver(e, folderId) {
    if (!draggingItem || draggingItem.id === folderId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverFolder(folderId);
  }

  function handleFolderDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverFolder(null);
    }
  }

  async function handleFolderDrop(e, targetFolderId) {
    e.preventDefault();
    if (!draggingItem || draggingItem.id === targetFolderId) return;
    setDragOverFolder(null);
    await handleMoveToFolder(draggingItem.item, targetFolderId, draggingItem.isFolder);
    setDraggingItem(null);
  }

  // ── Rubber-band selection ───────────────────────────────────────────
  function handleGridMouseDown(e) {
    if (e.button !== 0) return;
    if (e.target.closest(".ufile-card, button, input, a, .ctx-menu")) return;
    e.preventDefault();

    const start = { x: e.clientX, y: e.clientY };
    rbStart.current = start;
    setRubberBand({ x: start.x, y: start.y, w: 0, h: 0 });

    function onMove(ev) {
      const x = Math.min(ev.clientX, start.x);
      const y = Math.min(ev.clientY, start.y);
      const w = Math.abs(ev.clientX - start.x);
      const h = Math.abs(ev.clientY - start.y);
      setRubberBand({ x, y, w, h });
    }

    function onUp(ev) {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);

      const band = {
        left:   Math.min(ev.clientX, start.x),
        right:  Math.max(ev.clientX, start.x),
        top:    Math.min(ev.clientY, start.y),
        bottom: Math.max(ev.clientY, start.y),
      };
      const dx = band.right - band.left;
      const dy = band.bottom - band.top;

      if (dx > 5 || dy > 5) {
        const grid = gridRef.current;
        if (grid) {
          const cards = grid.querySelectorAll("[data-file-id]");
          const newSel = new Set();
          cards.forEach(card => {
            const cr = card.getBoundingClientRect();
            const overlap = !(cr.right < band.left || cr.left > band.right || cr.bottom < band.top || cr.top > band.bottom);
            if (overlap) newSel.add(card.dataset.fileId);
          });
          if (newSel.size > 0) setSelected(newSel);
        }
      }
      setRubberBand(null);
      rbStart.current = null;
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // ── Preview ─────────────────────────────────────────────────────────
  async function openPreview(item) {
    const t = getType(item);
    if (t === "document") { handleDownload(item); return; }
    if (item._source === "media") {
      navigate(`/projects/${projectId}/media/${item.id}`, { state: { from: location.pathname } });
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

  // ── File actions ─────────────────────────────────────────────────────
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
      const d = item._source === "media"
        ? await projectMediaApi.getDownloadUrl(item.id)
        : await projectFilesApi.getDownloadUrl(item.id);
      if (!d.url) return;
      const a = document.createElement("a"); a.href = d.url; a.download = item.name;
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

  async function handleBulkMove(targetFolderId) {
    await Promise.all([...selected].map(id => {
      const item = items.find(i => i.id === id);
      if (!item) return;
      return item._source === "media"
        ? projectMediaApi.update(id, { folder_id: targetFolderId || null }).catch(() => {})
        : projectFilesApi.update(id, { folder_id: targetFolderId || null }).catch(() => {});
    }));
    load();
    setSelected(new Set());
  }

  function toggleSelect(id, e) {
    e.stopPropagation();
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  // ── Derived data ─────────────────────────────────────────────────────
  const filtered  = items.filter(item => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (typeFilter !== "all" && getType(item) !== typeFilter) return false;
    return true;
  });
  const displayed = sortItems(filtered, sortField, sortDir);

  // Folders for move submenu (excluding current folder)
  const movableFolders = allFolders.filter(f => f.id !== folderId);

  // Sort button label
  const sortLabel = SORT_FIELDS.find(f => f.key === sortField)?.label ?? "Sort";

  return (
    <div className="ufiles-page" onClick={closeCtx} onContextMenu={canEdit ? handleGridContextMenu : undefined}>

      {/* ── Toolbar ── */}
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
          {/* Sort dropdown */}
          <div className="ufiles-sort-wrap" onClick={e => e.stopPropagation()}>
            <button
              className={`icon-btn ufiles-sort-btn ${showSortMenu ? "active" : ""}`}
              onClick={() => setShowSortMenu(v => !v)}
              title="Sort"
            >
              <ArrowsDownUp size={15} weight="duotone" />
              <span className="ufiles-sort-label">{sortLabel}</span>
              {sortDir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
            </button>
            {showSortMenu && (
              <div className="ufiles-sort-menu">
                {SORT_FIELDS.map(f => (
                  <button
                    key={f.key}
                    className={sortField === f.key ? "active" : ""}
                    onClick={() => handleSortField(f.key)}
                  >
                    {f.label}
                    {sortField === f.key && (sortDir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button className={`icon-btn ${view === "grid" ? "active" : ""}`} onClick={() => setView("grid")} title="Grid"><SquaresFour size={16} weight="duotone" /></button>
          <button className={`icon-btn ${view === "list" ? "active" : ""}`} onClick={() => setView("list")} title="List"><Rows size={16} weight="duotone" /></button>
          {canEdit && <button className="icon-btn" onClick={() => setShowNewFolder(true)} title="New Folder"><FolderSimplePlus size={17} weight="duotone" /></button>}
          {canEdit && (
            <button className="ufiles-upload-btn" onClick={() => fileInputRef.current?.click()}>
              <UploadSimple size={15} weight="bold" />
              Upload
            </button>
          )}
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
          {canEdit && movableFolders.length > 0 && (
            <div className="bulk-move-wrap" onClick={e => e.stopPropagation()}>
              <button className="btn-ghost-sm" onClick={e => { e.stopPropagation(); setMoveSub(v => !v); }}>
                <FolderSimple size={13} /> Move to
              </button>
              {moveSub && (
                <div className="bulk-move-menu">
                  {folderId && (
                    <button onClick={() => { setMoveSub(false); handleBulkMove(null); }}>
                      <House size={12} /> Root
                    </button>
                  )}
                  {movableFolders.map(f => (
                    <button key={f.id} onClick={() => { setMoveSub(false); handleBulkMove(f.id); }}>
                      <FolderSimple size={12} /> {f.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {canDelete && <button className="btn-danger-sm" onClick={handleBulkDelete}><Trash size={13} /> Delete</button>}
          <button className="btn-ghost-sm" onClick={() => setSelected(new Set())}><X size={13} /> Clear</button>
        </div>
      )}

      {/* Breadcrumb */}
      {folderId && (() => {
        const path = [];
        let cur = folderId;
        while (cur) {
          const f = allFolders.find(x => x.id === cur);
          if (!f) break;
          path.unshift(f);
          cur = f.parent_id || null;
        }
        return (
          <div className="mpv-breadcrumb">
            <button onClick={() => navigate(`/projects/${projectId}/files`)}><House size={13} /> Files</button>
            {path.map((f, i) => (
              <React.Fragment key={f.id}>
                <CaretRight size={11} />
                {i < path.length - 1
                  ? <button onClick={() => navigate(`/projects/${projectId}/files/folder/${f.id}`)}>{f.name}</button>
                  : <span>{f.name}</span>
                }
              </React.Fragment>
            ))}
          </div>
        );
      })()}

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
          {displayed.length === 0 && folders.length === 0 && (
            <div className="mpv-empty">
              <UploadSimple size={48} weight="duotone" style={{ opacity: 0.2 }} />
              <p>{search || typeFilter !== "all" ? "No files match your filters." : "No files yet. Upload your first file."}</p>
              {!search && typeFilter === "all" && (
                <button className="ufiles-upload-btn" onClick={() => fileInputRef.current?.click()}>
                  <UploadSimple size={14} weight="bold" /> Upload Files
                </button>
              )}
            </div>
          )}

          {/* ── Grid view ── */}
          {view === "grid" && (
            <div
              ref={gridRef}
              className="ufiles-grid"
              onMouseDown={handleGridMouseDown}
            >
              {/* Folder cards */}
              {folders.map(folder => (
                <motion.div
                  key={`folder-${folder.id}`}
                  className={`ufile-card ufile-folder-card${dragOverFolder === folder.id ? " drag-over" : ""}${draggingItem?.id === folder.id ? " dragging" : ""}`}
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  draggable={canEdit}
                  onDragStart={e => handleDragStart(e, folder, true)}
                  onDragEnd={handleDragEnd}
                  onDragOver={e => handleFolderDragOver(e, folder.id)}
                  onDragLeave={handleFolderDragLeave}
                  onDrop={e => handleFolderDrop(e, folder.id)}
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
                      <FolderOpen size={44} weight="duotone" style={{ color: dragOverFolder === folder.id ? "#fbbf24" : "#f59e0b" }} />
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
              {displayed.map(item => {
                const t = getType(item);
                const canPreview = t !== "document";
                const isSelected = selected.has(item.id);
                const status = item.status && STATUS_COLORS[item.status];
                return (
                  <motion.div
                    key={item.id}
                    data-file-id={item.id}
                    className={`ufile-card${isSelected ? " selected" : ""}${draggingItem?.id === item.id ? " dragging" : ""}`}
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    draggable={canEdit}
                    onDragStart={e => handleDragStart(e, item, false)}
                    onDragEnd={handleDragEnd}
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

          {/* ── List view ── */}
          {view === "list" && (
            <div className="mpv-list">
              <div className="mpv-list-header">
                {[
                  { key: "name", label: "Name" },
                  { key: "type", label: "Type" },
                  { key: "size", label: "Size" },
                  { key: "created_at", label: "Added" },
                ].map(col => (
                  <span
                    key={col.key}
                    className={`mpv-list-sortable${sortField === col.key ? " sort-active" : ""}`}
                    onClick={() => handleSortField(col.key)}
                    style={{ cursor: "pointer", userSelect: "none" }}
                  >
                    {col.label}
                    {sortField === col.key && (sortDir === "asc" ? <ArrowUp size={10} style={{ marginLeft: 3 }} /> : <ArrowDown size={10} style={{ marginLeft: 3 }} />)}
                  </span>
                ))}
                <span />
              </div>
              {folders.map(folder => (
                <div
                  key={`folder-${folder.id}`}
                  className={`mpv-list-row${dragOverFolder === folder.id ? " drag-over" : ""}`}
                  draggable={canEdit}
                  onDragStart={e => handleDragStart(e, folder, true)}
                  onDragEnd={handleDragEnd}
                  onDragOver={e => handleFolderDragOver(e, folder.id)}
                  onDragLeave={handleFolderDragLeave}
                  onDrop={e => handleFolderDrop(e, folder.id)}
                  onClick={() => navigate(`/projects/${projectId}/files/folder/${folder.id}`)}
                  onContextMenu={e => openCtxMenu(e, folder, true)}
                >
                  <span className="mpv-list-name">
                    <FolderOpen size={15} weight="duotone" style={{ color: dragOverFolder === folder.id ? "#fbbf24" : "#f59e0b" }} />
                    {folder.name}
                  </span>
                  <span>Folder</span>
                  <span>—</span>
                  <span>{folder.created_at ? new Date(folder.created_at).toLocaleDateString() : "—"}</span>
                  <span />
                </div>
              ))}
              {displayed.map(item => {
                const t = getType(item);
                const status = item.status && STATUS_COLORS[item.status];
                return (
                  <div
                    key={item.id}
                    data-file-id={item.id}
                    className={`mpv-list-row${selected.has(item.id) ? " selected" : ""}${draggingItem?.id === item.id ? " dragging" : ""}`}
                    draggable={canEdit}
                    onDragStart={e => handleDragStart(e, item, false)}
                    onDragEnd={handleDragEnd}
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
                      {canDownload && <button onClick={() => handleDownload(item)}><DownloadSimple size={14} /></button>}
                      {canEdit    && <button onClick={() => { setRenameItem({ ...item, _type: "file" }); setRenameVal(item.name); }}><PencilSimple size={14} /></button>}
                      {canDelete  && <button onClick={() => handleDelete(item)}><Trash size={14} /></button>}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Rubber-band selection overlay ── */}
      {rubberBand && rubberBand.w > 2 && rubberBand.h > 2 && (
        <div
          className="rubber-band-select"
          style={{
            position: "fixed",
            left:   rubberBand.x,
            top:    rubberBand.y,
            width:  rubberBand.w,
            height: rubberBand.h,
            pointerEvents: "none",
            zIndex: 9999,
          }}
        />
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
              {canEdit && (
                <>
                  <button onClick={() => { setRenameItem({ ...ctxMenu.item, _type: "folder" }); setRenameVal(ctxMenu.item.name); closeCtx(); }}>
                    <PencilSimple size={13} /> Rename
                  </button>
                  {movableFolders.length > 0 && (
                    <div
                      className="ctx-submenu-wrap"
                      onMouseEnter={() => setMoveSub(true)}
                      onMouseLeave={() => setMoveSub(false)}
                    >
                      <button className="ctx-has-sub">
                        <FolderSimple size={13} /> Move to
                        <ChevronRight size={11} style={{ marginLeft: "auto" }} />
                      </button>
                      {moveSub && (
                        <div className="ctx-submenu">
                          {folderId && (
                            <button onClick={() => handleMoveToFolder(ctxMenu.item, null, true)}>
                              <House size={11} /> Root
                            </button>
                          )}
                          {movableFolders.filter(f => f.id !== ctxMenu.item.id).map(f => (
                            <button key={f.id} onClick={() => handleMoveToFolder(ctxMenu.item, f.id, true)}>
                              <FolderSimple size={11} /> {f.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
              {canDelete && (
                <>
                  <div className="ctx-divider" />
                  <button className="danger" onClick={() => { handleFolderDelete(ctxMenu.item); closeCtx(); }}>
                    <Trash size={13} /> Delete
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              {getType(ctxMenu.item) !== "document" && (
                <button onClick={() => { openPreview(ctxMenu.item); closeCtx(); }}>
                  <Play size={13} /> Preview
                </button>
              )}
              {canDownload && (
                <button onClick={() => { handleDownload(ctxMenu.item); closeCtx(); }}>
                  <DownloadSimple size={13} /> Download
                </button>
              )}
              {canEdit && (
                <>
                  <button onClick={() => { setRenameItem({ ...ctxMenu.item, _type: "file" }); setRenameVal(ctxMenu.item.name); closeCtx(); }}>
                    <PencilSimple size={13} /> Rename
                  </button>
                  {(allFolders.length > 0 || folderId) && (
                    <div
                      className="ctx-submenu-wrap"
                      onMouseEnter={() => setMoveSub(true)}
                      onMouseLeave={() => setMoveSub(false)}
                    >
                      <button className="ctx-has-sub">
                        <FolderSimple size={13} /> Move to
                        <ChevronRight size={11} style={{ marginLeft: "auto" }} />
                      </button>
                      {moveSub && (
                        <div className="ctx-submenu">
                          {folderId && (
                            <button onClick={() => handleMoveToFolder(ctxMenu.item, null, false)}>
                              <House size={11} /> Root
                            </button>
                          )}
                          {allFolders.map(f => (
                            <button key={f.id} onClick={() => handleMoveToFolder(ctxMenu.item, f.id, false)}>
                              <FolderSimple size={11} /> {f.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
              {ctxMenu.item._source === "media" && canEdit && (
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
              {canDelete && (
                <>
                  <div className="ctx-divider" />
                  <button className="danger" onClick={() => { handleDelete(ctxMenu.item); closeCtx(); }}>
                    <Trash size={13} /> Delete
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Background context menu ── */}
      {bgCtxMenu && (
        <div
          className="ctx-menu"
          style={{ top: bgCtxMenu.y, left: bgCtxMenu.x }}
          onClick={e => e.stopPropagation()}
          onContextMenu={e => e.preventDefault()}
        >
          <button onClick={() => { setBgCtxMenu(null); setShowNewFolder(true); }}>
            <FolderSimplePlus size={13} /> New Folder
          </button>
          <div className="ctx-divider" />
          <button onClick={() => { setBgCtxMenu(null); fileInputRef.current?.click(); }}>
            <UploadSimple size={13} /> Upload Files
          </button>
        </div>
      )}

      {/* Drop overlay */}
      <AnimatePresence>
        {isDragOver && canEdit && (
          <motion.div
            className="files-drop-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <CloudArrowUp size={52} weight="thin" />
            <p>Drop files to upload</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={e => { if (e.target.files?.length) handleUploadFiles(e.target.files); e.target.value = ""; }}
      />

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
