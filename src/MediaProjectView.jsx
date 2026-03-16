import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  CloudArrowUp, FolderSimplePlus, SquaresFour, Rows,
  House, CaretRight, MagnifyingGlass, Users, DotsThree,
  FolderOpen, VideoCamera, FileImage, File, FileAudio,
  Trash, PencilSimple, Link, Copy, CheckCircle, X,
  DownloadSimple, ArrowsOut, CheckSquare, Square,
  FolderArrowDown,
} from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";
import DashboardLayout from "./DashboardLayout";
import UploadPanel from "./components/media/UploadPanel";
import TeamPanel from "./components/media/TeamPanel";
import ShareModal from "./components/media/ShareModal";
import { userApiFetch, formatSize } from "./lib/userApi";

const STATUS_COLORS = {
  in_review: { label: "In Review", class: "badge-review"   },
  approved:  { label: "Approved",  class: "badge-approved" },
  revision:  { label: "Revision",  class: "badge-revision" },
};

export default function MediaProjectView() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { id: projectId, folderId } = useParams();

  const [project,      setProject]      = useState(null);
  const [folders,      setFolders]      = useState([]);
  const [assets,       setAssets]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [view,         setView]         = useState("grid");
  const [search,       setSearch]       = useState("");
  const [filterType,   setFilterType]   = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showUpload,   setShowUpload]   = useState(false);
  const [showTeam,     setShowTeam]     = useState(false);
  const [shareAsset,   setShareAsset]   = useState(null);
  const [copied,       setCopied]       = useState(null);

  // New Folder
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // Rename asset
  const [renameAsset,   setRenameAsset]  = useState(null);
  const [renameVal,     setRenameVal]    = useState("");

  // Rename folder
  const [renameFolder,    setRenameFolder]    = useState(null);
  const [renameFolderVal, setRenameFolderVal] = useState("");

  // Move to folder
  const [moveAsset,    setMoveAsset]    = useState(null);
  const [allFoldersList, setAllFoldersList] = useState([]);

  // Bulk select
  const [selected,   setSelected]   = useState(new Set());
  const [bulkStatus, setBulkStatus] = useState("");

  useEffect(() => {
    if (!authLoading && !user) navigate("/login", { replace: true });
  }, [user, authLoading]);

  const load = useCallback(() => {
    if (!user || !projectId) return;
    setLoading(true);
    setSelected(new Set());
    Promise.all([
      userApiFetch(`/api/media/projects?id=${projectId}`).then(d => d.project).catch(() => null),
      userApiFetch(`/api/media/folders?projectId=${projectId}${folderId ? `&parentId=${folderId}` : "&parentId=root"}`).then(d => d.folders || []).catch(() => []),
      userApiFetch(`/api/media/assets?projectId=${projectId}${folderId ? `&folderId=${folderId}` : "&folderId=root"}`).then(d => d.assets || []).catch(() => []),
    ]).then(([proj, fo, as]) => {
      if (!proj) {
        return userApiFetch("/api/media/projects")
          .then(d => (d.projects || []).find(p => p.id === projectId) || null)
          .then(p => { setProject(p); setFolders(fo); setAssets(as); });
      }
      setProject(proj); setFolders(fo); setAssets(as);
    })
    .catch(console.error)
    .finally(() => setLoading(false));
  }, [user, projectId, folderId]);

  useEffect(() => { load(); }, [load]);

  /* ── Asset actions ── */
  async function handleDeleteAsset(assetId) {
    if (!window.confirm("Delete this asset? This cannot be undone.")) return;
    await userApiFetch(`/api/media/assets?id=${assetId}`, { method: "DELETE" });
    setAssets(as => as.filter(a => a.id !== assetId));
    setSelected(s => { const n = new Set(s); n.delete(assetId); return n; });
  }

  async function handleStatusChange(assetId, status) {
    await userApiFetch(`/api/media/assets?id=${assetId}`, {
      method: "PUT", body: JSON.stringify({ status }),
    });
    setAssets(as => as.map(a => a.id === assetId ? { ...a, status } : a));
  }

  async function copyShareLink(asset) {
    const data = await userApiFetch("/api/media/share", {
      method: "POST",
      body: JSON.stringify({ assetId: asset.id, allowDownload: true, allowComments: true }),
    });
    const token = data.link?.token || (data.shareUrl || "").split("/").pop();
    await navigator.clipboard.writeText(`${window.location.origin}/media/share/${token}`);
    setCopied(asset.id);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleRenameAsset() {
    const name = renameVal.trim();
    if (!name || name === renameAsset.name) { setRenameAsset(null); return; }
    await userApiFetch(`/api/media/assets?id=${renameAsset.id}`, {
      method: "PUT", body: JSON.stringify({ name }),
    });
    setAssets(as => as.map(a => a.id === renameAsset.id ? { ...a, name } : a));
    setRenameAsset(null);
  }

  function handleDownload(asset) {
    if (asset.bunny_playback_url) {
      window.open(asset.bunny_playback_url, "_blank");
    } else if (asset.bunny_thumbnail_url) {
      // derive CDN from thumbnail URL: https://{cdn}/{guid}/thumbnail.jpg
      const cdnBase = asset.bunny_thumbnail_url.split(`/${asset.bunny_video_guid}/`)[0];
      window.open(`${cdnBase}/${asset.bunny_video_guid}/play`, "_blank");
    }
  }

  async function openMoveModal(asset) {
    setMoveAsset(asset);
    const data = await userApiFetch(`/api/media/folders?projectId=${projectId}`).catch(() => ({ folders: [] }));
    setAllFoldersList(data.folders || []);
  }

  async function handleMoveAsset(targetFolderId) {
    await userApiFetch(`/api/media/assets?id=${moveAsset.id}`, {
      method: "PUT", body: JSON.stringify({ folderId: targetFolderId }),
    });
    setAssets(as => as.filter(a => a.id !== moveAsset.id));
    setMoveAsset(null);
  }

  /* ── Folder actions ── */
  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      const data = await userApiFetch("/api/media/folders", {
        method: "POST",
        body: JSON.stringify({ name, projectId, parentFolderId: folderId || null }),
      });
      setFolders(fs => [...fs, data.folder]);
      setShowNewFolder(false); setNewFolderName("");
    } catch (err) { alert("Failed to create folder: " + err.message); }
  }

  async function handleRenameFolder() {
    const name = renameFolderVal.trim();
    if (!name || name === renameFolder.name) { setRenameFolder(null); return; }
    await userApiFetch(`/api/media/folders?id=${renameFolder.id}`, {
      method: "PUT", body: JSON.stringify({ name }),
    });
    setFolders(fs => fs.map(f => f.id === renameFolder.id ? { ...f, name } : f));
    setRenameFolder(null);
  }

  async function handleDeleteFolder(folder) {
    if (!window.confirm(`Delete folder "${folder.name}"? Assets inside will not be deleted.`)) return;
    await userApiFetch(`/api/media/folders?id=${folder.id}`, { method: "DELETE" });
    setFolders(fs => fs.filter(f => f.id !== folder.id));
    if (folderId === folder.id) navigate(`/media/project/${projectId}`);
  }

  async function shareFolderLink(folder) {
    const data = await userApiFetch("/api/media/share", {
      method: "POST",
      body: JSON.stringify({ folderId: folder.id, allowDownload: true, allowComments: false }),
    });
    const token = data.link?.token || (data.shareUrl || "").split("/").pop();
    await navigator.clipboard.writeText(`${window.location.origin}/media/share/${token}`);
    setCopied("folder-" + folder.id);
    setTimeout(() => setCopied(null), 2000);
  }

  /* ── Bulk actions ── */
  function toggleSelect(id) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function toggleSelectAll() {
    if (selected.size === filteredAssets.length) setSelected(new Set());
    else setSelected(new Set(filteredAssets.map(a => a.id)));
  }

  async function bulkDelete() {
    if (!window.confirm(`Delete ${selected.size} asset(s)? This cannot be undone.`)) return;
    await Promise.all([...selected].map(id => userApiFetch(`/api/media/assets?id=${id}`, { method: "DELETE" }).catch(() => {})));
    setAssets(as => as.filter(a => !selected.has(a.id)));
    setSelected(new Set());
  }

  async function bulkSetStatus(status) {
    await Promise.all([...selected].map(id =>
      userApiFetch(`/api/media/assets?id=${id}`, { method: "PUT", body: JSON.stringify({ status }) }).catch(() => {})
    ));
    setAssets(as => as.map(a => selected.has(a.id) ? { ...a, status } : a));
    setSelected(new Set());
  }

  function filtered() {
    return assets.filter(a => {
      if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterType !== "all" && a.type !== filterType) return false;
      if (filterStatus !== "all" && a.status !== filterStatus) return false;
      return true;
    });
  }

  const filteredAssets = filtered();
  const hasBulk = selected.size > 0;

  return (
    <DashboardLayout title={project?.name || "Project"}>
      {/* Breadcrumb */}
      <div className="breadcrumb">
        <button className="breadcrumb-item" onClick={() => navigate("/media")}>
          <House size={13} /> Media
        </button>
        <CaretRight size={11} className="breadcrumb-sep" />
        <button className="breadcrumb-item" onClick={() => navigate(`/media/project/${projectId}`)}>
          {project?.name || "Project"}
        </button>
        {folderId && (
          <>
            <CaretRight size={11} className="breadcrumb-sep" />
            <span className="breadcrumb-item active">Folder</span>
          </>
        )}
      </div>

      {/* Toolbar */}
      <div className="files-toolbar" style={{ flexWrap: "wrap", gap: 8 }}>
        {hasBulk ? (
          /* ── Bulk action bar ── */
          <>
            <span style={{ fontSize: 13, color: "var(--t2)", fontWeight: 500 }}>
              {selected.size} selected
            </span>
            <select
              className="media-filter-select"
              value=""
              onChange={e => { if (e.target.value) bulkSetStatus(e.target.value); }}
            >
              <option value="">Set status…</option>
              <option value="in_review">In Review</option>
              <option value="approved">Approved</option>
              <option value="revision">Revision</option>
            </select>
            <button className="btn-ghost danger" onClick={bulkDelete}>
              <Trash size={14} /> Delete ({selected.size})
            </button>
            <button className="btn-ghost" onClick={() => setSelected(new Set())}>
              <X size={14} /> Deselect all
            </button>
          </>
        ) : (
          /* ── Normal toolbar ── */
          <>
            <button className="btn-primary-sm" onClick={() => setShowUpload(true)}>
              <CloudArrowUp size={14} /> Upload
            </button>
            <button className="btn-ghost" onClick={() => { setShowNewFolder(true); setNewFolderName(""); }}>
              <FolderSimplePlus size={14} /> New Folder
            </button>
            <button className="btn-ghost" onClick={() => setShowTeam(true)}>
              <Users size={14} /> Team
            </button>
          </>
        )}

        {/* Search */}
        <div className="media-search-wrap" style={{ flex: 1, minWidth: 160 }}>
          <MagnifyingGlass size={13} className="media-search-icon" />
          <input
            className="media-search"
            placeholder="Search assets…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Filters */}
        <select className="media-filter-select" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="all">All types</option>
          <option value="video">Video</option>
          <option value="image">Image</option>
          <option value="audio">Audio</option>
          <option value="document">Document</option>
        </select>
        <select className="media-filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All status</option>
          <option value="in_review">In Review</option>
          <option value="approved">Approved</option>
          <option value="revision">Revision</option>
        </select>

        <div className="view-toggle" style={{ marginLeft: "auto" }}>
          <button className={`view-btn ${view === "grid" ? "active" : ""}`} onClick={() => setView("grid")}>
            <SquaresFour size={16} />
          </button>
          <button className={`view-btn ${view === "list" ? "active" : ""}`} onClick={() => setView("list")}>
            <Rows size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="empty-state"><span className="spinner" /></div>
      ) : (
        <div className="media-project-layout">

          {/* Left sidebar — folder tree */}
          <aside className="media-folder-sidebar">
            <div className="media-folder-header">Folders</div>
            <button
              className={`media-folder-item ${!folderId ? "active" : ""}`}
              onClick={() => navigate(`/media/project/${projectId}`)}
            >
              <VideoCamera size={14} weight="duotone" /> All assets
            </button>
            {folders.map(f => (
              <FolderItem
                key={f.id}
                folder={f}
                active={folderId === f.id}
                copied={copied === "folder-" + f.id}
                onClick={() => navigate(`/media/project/${projectId}/folder/${f.id}`)}
                onRename={() => { setRenameFolder(f); setRenameFolderVal(f.name); }}
                onDelete={() => handleDeleteFolder(f)}
                onShareLink={() => shareFolderLink(f)}
              />
            ))}
          </aside>

          {/* Main content */}
          <div className="media-asset-area">
            {filteredAssets.length === 0 && folders.length === 0 ? (
              <div className="empty-state">
                <VideoCamera size={44} weight="thin" />
                <p>{search ? "No assets match your search" : "No assets here yet"}</p>
                {!search && (
                  <button className="btn-primary-sm" onClick={() => setShowUpload(true)}>
                    <CloudArrowUp size={13} weight="bold" /> Upload
                  </button>
                )}
              </div>
            ) : view === "grid" ? (
              <div className="media-asset-grid">
                {/* Select all toggle */}
                {filteredAssets.length > 0 && (
                  <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                    <button
                      className="btn-ghost"
                      style={{ fontSize: 12, padding: "4px 8px" }}
                      onClick={toggleSelectAll}
                    >
                      {selected.size === filteredAssets.length && filteredAssets.length > 0
                        ? <><CheckSquare size={14} /> Deselect all</>
                        : <><Square size={14} /> Select all</>
                      }
                    </button>
                    {hasBulk && (
                      <span style={{ fontSize: 12, color: "var(--t3)" }}>
                        {selected.size} of {filteredAssets.length} selected
                      </span>
                    )}
                  </div>
                )}
                <AnimatePresence>
                  {filteredAssets.map((asset, i) => (
                    <AssetCard
                      key={asset.id}
                      asset={asset}
                      index={i}
                      selected={selected.has(asset.id)}
                      onSelect={() => toggleSelect(asset.id)}
                      onOpen={() => navigate(`/media/asset/${asset.id}`)}
                      onDelete={() => handleDeleteAsset(asset.id)}
                      onStatusChange={s => handleStatusChange(asset.id, s)}
                      onCopyLink={() => copyShareLink(asset)}
                      copied={copied === asset.id}
                      onShare={() => setShareAsset(asset)}
                      onRename={() => { setRenameAsset(asset); setRenameVal(asset.name); }}
                      onDownload={() => handleDownload(asset)}
                      onMove={() => openMoveModal(asset)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <AssetListView
                assets={filteredAssets}
                selected={selected}
                onSelect={toggleSelect}
                onSelectAll={toggleSelectAll}
                onOpen={a => navigate(`/media/asset/${a.id}`)}
                onDelete={handleDeleteAsset}
                onStatusChange={handleStatusChange}
                onCopyLink={copyShareLink}
                copied={copied}
                onShare={setShareAsset}
                onRename={a => { setRenameAsset(a); setRenameVal(a.name); }}
                onDownload={handleDownload}
                onMove={openMoveModal}
              />
            )}
          </div>
        </div>
      )}

      {/* Upload panel */}
      <AnimatePresence>
        {showUpload && (
          <UploadPanel
            projectId={projectId}
            folderId={folderId || null}
            onClose={() => setShowUpload(false)}
            onUploaded={asset => { setAssets(as => [asset, ...as]); }}
          />
        )}
      </AnimatePresence>

      {/* Team panel */}
      <AnimatePresence>
        {showTeam && (
          <TeamPanel projectId={projectId} onClose={() => setShowTeam(false)} />
        )}
      </AnimatePresence>

      {/* Share modal */}
      <AnimatePresence>
        {shareAsset && (
          <ShareModal asset={shareAsset} onClose={() => setShareAsset(null)} />
        )}
      </AnimatePresence>

      {/* ── Modals ── */}

      {/* New Folder */}
      <SimpleModal
        open={showNewFolder}
        title={<><FolderSimplePlus size={16} /> New Folder</>}
        onClose={() => setShowNewFolder(false)}
        onConfirm={createFolder}
        confirmLabel="Create"
        confirmDisabled={!newFolderName.trim()}
      >
        <input
          className="media-search"
          style={{ width: "100%", boxSizing: "border-box" }}
          placeholder="Folder name"
          value={newFolderName}
          onChange={e => setNewFolderName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") createFolder(); }}
          autoFocus
        />
      </SimpleModal>

      {/* Rename Asset */}
      <SimpleModal
        open={!!renameAsset}
        title={<><PencilSimple size={16} /> Rename Asset</>}
        onClose={() => setRenameAsset(null)}
        onConfirm={handleRenameAsset}
        confirmLabel="Save"
        confirmDisabled={!renameVal.trim()}
      >
        <input
          className="media-search"
          style={{ width: "100%", boxSizing: "border-box" }}
          placeholder="Asset name"
          value={renameVal}
          onChange={e => setRenameVal(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleRenameAsset(); }}
          autoFocus
        />
      </SimpleModal>

      {/* Rename Folder */}
      <SimpleModal
        open={!!renameFolder}
        title={<><PencilSimple size={16} /> Rename Folder</>}
        onClose={() => setRenameFolder(null)}
        onConfirm={handleRenameFolder}
        confirmLabel="Save"
        confirmDisabled={!renameFolderVal.trim()}
      >
        <input
          className="media-search"
          style={{ width: "100%", boxSizing: "border-box" }}
          placeholder="Folder name"
          value={renameFolderVal}
          onChange={e => setRenameFolderVal(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleRenameFolder(); }}
          autoFocus
        />
      </SimpleModal>

      {/* Move to Folder */}
      <AnimatePresence>
        {moveAsset && (
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setMoveAsset(null)}
          >
            <motion.div
              className="modal-card glass-card"
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="modal-header">
                <FolderArrowDown size={16} /> Move to Folder
                <button className="modal-close" onClick={() => setMoveAsset(null)}><X size={16} /></button>
              </div>
              <div className="folder-picker" style={{ marginBottom: 12 }}>
                <button className="folder-pick-item" onClick={() => handleMoveAsset(null)}>
                  <VideoCamera size={14} weight="duotone" /> Root (no folder)
                </button>
                {allFoldersList.map(f => (
                  <button
                    key={f.id}
                    className="folder-pick-item"
                    disabled={f.id === moveAsset.folder_id}
                    onClick={() => handleMoveAsset(f.id)}
                  >
                    <FolderOpen size={14} weight="duotone" /> {f.name}
                    {f.id === moveAsset.folder_id && <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--t3)" }}>current</span>}
                  </button>
                ))}
                {allFoldersList.length === 0 && (
                  <p style={{ color: "var(--t3)", fontSize: 12, padding: "8px 0" }}>No folders in this project</p>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button className="btn-ghost" onClick={() => setMoveAsset(null)}>Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}

/* ── Simple Modal ─────────────────────────────────────────────────── */
function SimpleModal({ open, title, children, onClose, onConfirm, confirmLabel, confirmDisabled }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="modal-card glass-card"
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header">
              {title}
              <button className="modal-close" onClick={onClose}><X size={16} /></button>
            </div>
            <div style={{ marginBottom: 16 }}>{children}</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn-primary-sm" onClick={onConfirm} disabled={confirmDisabled}>
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── Folder Item (sidebar) ───────────────────────────────────────── */
function FolderItem({ folder, active, copied, onClick, onRename, onDelete, onShareLink }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const h = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div className={`media-folder-item-wrap ${active ? "active" : ""}`} ref={menuRef}>
      <button className="media-folder-item-btn" onClick={onClick}>
        <FolderOpen size={14} weight="duotone" /> {folder.name}
      </button>
      <div style={{ position: "relative", flexShrink: 0 }}>
        <button
          className="card-menu-btn folder-menu-btn"
          onClick={e => { e.stopPropagation(); setMenuOpen(m => !m); }}
        >
          <DotsThree size={14} weight="bold" />
        </button>
        {menuOpen && (
          <div className="card-menu-dropdown" style={{ right: 0, left: "auto", top: "calc(100% + 4px)" }}>
            <button className="card-menu-item" onClick={() => { setMenuOpen(false); onRename(); }}>
              <PencilSimple size={13} /> Rename
            </button>
            <button className="card-menu-item" onClick={() => { setMenuOpen(false); onShareLink(); }}>
              {copied ? <CheckCircle size={13} /> : <Link size={13} />}
              {copied ? "Link copied!" : "Copy folder link"}
            </button>
            <div className="card-menu-divider" />
            <button className="card-menu-item danger" onClick={() => { setMenuOpen(false); onDelete(); }}>
              <Trash size={13} /> Delete folder
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Asset Card ─────────────────────────────────────────────────── */
function AssetCard({ asset, index, selected, onSelect, onOpen, onDelete, onStatusChange, onCopyLink, copied, onShare, onRename, onDownload, onMove }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const h = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const status = STATUS_COLORS[asset.status] || STATUS_COLORS.in_review;

  return (
    <motion.div
      className={`media-asset-card ${selected ? "selected" : ""}`}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ delay: index * 0.04, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      onClick={onOpen}
    >
      {/* Checkbox */}
      <div
        className="asset-select-check"
        onClick={e => { e.stopPropagation(); onSelect(); }}
      >
        {selected
          ? <CheckSquare size={16} weight="fill" style={{ color: "var(--purple-l)" }} />
          : <Square size={16} style={{ color: "var(--t3)" }} />
        }
      </div>

      {/* Thumbnail */}
      <div className="media-asset-thumb">
        {asset.bunny_video_status === "ready" && asset.bunny_thumbnail_url ? (
          <img src={asset.bunny_thumbnail_url} alt={asset.name} />
        ) : asset.bunny_video_status === "uploading" ? (
          <div className="media-asset-thumb-processing">
            <span className="spinner" /><span>Processing…</span>
          </div>
        ) : (
          <AssetTypeIcon type={asset.type} size={36} />
        )}
        <span className={`media-status-badge ${status.class}`}>{status.label}</span>
        {asset.version > 1 && <span className="media-version-badge">v{asset.version}</span>}
        {asset.duration && <span className="media-duration-badge">{formatDuration(asset.duration)}</span>}
      </div>

      {/* Info */}
      <div className="media-asset-info">
        <span className="media-asset-name">{asset.name}</span>
        <span className="media-asset-meta">{asset.file_size ? formatSize(asset.file_size) : "—"}</span>
      </div>

      {/* Context menu */}
      <div className="card-menu" ref={menuRef} onClick={e => e.stopPropagation()}>
        <button className="card-menu-btn" onClick={() => setMenuOpen(m => !m)}>
          <DotsThree size={16} weight="bold" />
        </button>
        {menuOpen && (
          <div className="card-menu-dropdown">
            <button className="card-menu-item" onClick={() => { setMenuOpen(false); onOpen(); }}>
              <ArrowsOut size={13} /> Open
            </button>
            <button className="card-menu-item" onClick={() => { setMenuOpen(false); onRename(); }}>
              <PencilSimple size={13} /> Rename
            </button>
            <button className="card-menu-item" onClick={() => { setMenuOpen(false); onCopyLink(); }}>
              {copied ? <CheckCircle size={13} /> : <Copy size={13} />}
              {copied ? "Copied!" : "Copy link"}
            </button>
            <button className="card-menu-item" onClick={() => { setMenuOpen(false); onShare(); }}>
              <Link size={13} /> Share settings
            </button>
            {(asset.bunny_playback_url || asset.bunny_thumbnail_url) && (
              <button className="card-menu-item" onClick={() => { setMenuOpen(false); onDownload(); }}>
                <DownloadSimple size={13} /> Download
              </button>
            )}
            <button className="card-menu-item" onClick={() => { setMenuOpen(false); onMove(); }}>
              <FolderArrowDown size={13} /> Move to folder
            </button>
            <div className="card-menu-divider" />
            {["in_review", "approved", "revision"].map(s => (
              <button
                key={s}
                className={`card-menu-item ${asset.status === s ? "active" : ""}`}
                onClick={() => { setMenuOpen(false); onStatusChange(s); }}
              >
                <span className={`status-dot ${s}`} />
                {STATUS_COLORS[s].label}
              </button>
            ))}
            <div className="card-menu-divider" />
            <button className="card-menu-item danger" onClick={() => { setMenuOpen(false); onDelete(); }}>
              <Trash size={13} /> Delete
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ── Asset List View ─────────────────────────────────────────────── */
function AssetListView({ assets, selected, onSelect, onSelectAll, onOpen, onDelete, onStatusChange, onCopyLink, copied, onShare, onRename, onDownload, onMove }) {
  const allSelected = assets.length > 0 && selected.size === assets.length;
  return (
    <table className="file-list-table">
      <thead>
        <tr>
          <th style={{ width: 32 }}>
            <button style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t2)", padding: 0, display: "flex" }} onClick={onSelectAll}>
              {allSelected ? <CheckSquare size={15} weight="fill" /> : <Square size={15} />}
            </button>
          </th>
          <th>Name</th>
          <th>Type</th>
          <th>Status</th>
          <th>Size</th>
          <th>Date</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {assets.map(asset => {
          const status = STATUS_COLORS[asset.status] || STATUS_COLORS.in_review;
          return (
            <tr key={asset.id} className={`file-list-row ${selected.has(asset.id) ? "selected" : ""}`} onClick={() => onOpen(asset)} style={{ cursor: "pointer" }}>
              <td onClick={e => { e.stopPropagation(); onSelect(asset.id); }}>
                {selected.has(asset.id)
                  ? <CheckSquare size={15} weight="fill" style={{ color: "var(--purple-l)" }} />
                  : <Square size={15} style={{ color: "var(--t3)" }} />
                }
              </td>
              <td>
                <div className="file-list-name">
                  <AssetTypeIcon type={asset.type} size={16} />
                  {asset.name}
                </div>
              </td>
              <td>{asset.type}</td>
              <td>
                <select
                  className="media-filter-select"
                  value={asset.status || "in_review"}
                  onClick={e => e.stopPropagation()}
                  onChange={e => { e.stopPropagation(); onStatusChange(asset.id, e.target.value); }}
                  style={{ fontSize: 11, padding: "2px 6px" }}
                >
                  <option value="in_review">In Review</option>
                  <option value="approved">Approved</option>
                  <option value="revision">Revision</option>
                </select>
              </td>
              <td>{asset.file_size ? formatSize(asset.file_size) : "—"}</td>
              <td>{asset.created_at ? new Date(asset.created_at).toLocaleDateString() : "—"}</td>
              <td onClick={e => e.stopPropagation()}>
                <ListRowMenu
                  asset={asset}
                  copied={copied}
                  onOpen={() => onOpen(asset)}
                  onRename={() => onRename(asset)}
                  onCopyLink={() => onCopyLink(asset)}
                  onShare={() => onShare(asset)}
                  onDownload={() => onDownload(asset)}
                  onMove={() => onMove(asset)}
                  onDelete={() => onDelete(asset.id)}
                  onStatusChange={s => onStatusChange(asset.id, s)}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ListRowMenu({ asset, copied, onOpen, onRename, onCopyLink, onShare, onDownload, onMove, onDelete, onStatusChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button className="card-menu-btn" style={{ opacity: 1 }} onClick={() => setOpen(m => !m)}>
        <DotsThree size={16} weight="bold" />
      </button>
      {open && (
        <div className="card-menu-dropdown" style={{ right: 0, left: "auto" }}>
          <button className="card-menu-item" onClick={() => { setOpen(false); onOpen(); }}><ArrowsOut size={13} /> Open</button>
          <button className="card-menu-item" onClick={() => { setOpen(false); onRename(); }}><PencilSimple size={13} /> Rename</button>
          <button className="card-menu-item" onClick={() => { setOpen(false); onCopyLink(); }}>
            {copied === asset.id ? <CheckCircle size={13} /> : <Copy size={13} />}
            {copied === asset.id ? "Copied!" : "Copy link"}
          </button>
          <button className="card-menu-item" onClick={() => { setOpen(false); onShare(); }}><Link size={13} /> Share settings</button>
          {(asset.bunny_playback_url || asset.bunny_thumbnail_url) && (
            <button className="card-menu-item" onClick={() => { setOpen(false); onDownload(); }}><DownloadSimple size={13} /> Download</button>
          )}
          <button className="card-menu-item" onClick={() => { setOpen(false); onMove(); }}><FolderArrowDown size={13} /> Move to folder</button>
          <div className="card-menu-divider" />
          {["in_review", "approved", "revision"].map(s => (
            <button key={s} className={`card-menu-item ${asset.status === s ? "active" : ""}`} onClick={() => { setOpen(false); onStatusChange(s); }}>
              <span className={`status-dot ${s}`} /> {STATUS_COLORS[s].label}
            </button>
          ))}
          <div className="card-menu-divider" />
          <button className="card-menu-item danger" onClick={() => { setOpen(false); onDelete(); }}><Trash size={13} /> Delete</button>
        </div>
      )}
    </div>
  );
}

/* ── Helpers ── */
function AssetTypeIcon({ type, size = 24 }) {
  const props = { size, weight: "duotone" };
  if (type === "video") return <VideoCamera {...props} style={{ color: "#a78bfa" }} />;
  if (type === "image") return <FileImage   {...props} style={{ color: "#60a5fa" }} />;
  if (type === "audio") return <FileAudio   {...props} style={{ color: "#34d399" }} />;
  return <File {...props} style={{ color: "#94a3b8" }} />;
}

function formatDuration(s) {
  if (!s) return "";
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
