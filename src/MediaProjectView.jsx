import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, CloudArrowUp, FolderSimplePlus, SquaresFour, Rows,
  House, CaretRight, MagnifyingGlass, Users, DotsThree,
  FolderOpen, VideoCamera, FileImage, File, FileAudio,
  Trash, PencilSimple, Link, Copy, CheckCircle, X, CaretDown,
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

  const [project,    setProject]    = useState(null);
  const [folders,    setFolders]    = useState([]);
  const [assets,     setAssets]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [view,       setView]       = useState("grid");
  const [search,     setSearch]     = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showUpload, setShowUpload] = useState(false);
  const [showTeam,   setShowTeam]   = useState(false);
  const [shareAsset, setShareAsset] = useState(null);
  const [copied,     setCopied]     = useState(null);
  const [menuAsset,  setMenuAsset]  = useState(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login", { replace: true });
  }, [user, authLoading]);

  const load = useCallback(() => {
    if (!user || !projectId) return;
    setLoading(true);
    Promise.all([
      userApiFetch(`/api/media/projects?id=${projectId}`).then(d => d.project).catch(() => null),
      userApiFetch(`/api/media/folders?projectId=${projectId}${folderId ? `&parentId=${folderId}` : "&parentId=root"}`).then(d => d.folders || []).catch(() => []),
      userApiFetch(`/api/media/assets?projectId=${projectId}${folderId ? `&folderId=${folderId}` : "&folderId=root"}`).then(d => d.assets || []).catch(() => []),
    ]).then(([proj, fo, as]) => {
      // If project fetch failed (id-based GET not supported), fetch list
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

  const allFolders = useCallback(() => {
    return userApiFetch(`/api/media/folders?projectId=${projectId}`).then(d => d.folders || []);
  }, [projectId]);

  async function handleDeleteAsset(assetId) {
    if (!window.confirm("Delete this asset? This cannot be undone.")) return;
    await userApiFetch(`/api/media/assets?id=${assetId}`, { method: "DELETE" });
    setAssets(as => as.filter(a => a.id !== assetId));
  }

  async function handleStatusChange(assetId, status) {
    await userApiFetch(`/api/media/assets?id=${assetId}`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
    setAssets(as => as.map(a => a.id === assetId ? { ...a, status } : a));
  }

  async function copyShareLink(asset) {
    const data = await userApiFetch("/api/media/share", {
      method: "POST",
      body: JSON.stringify({ assetId: asset.id, allowDownload: true, allowComments: true }),
    });
    const url = data.shareUrl || `${window.location.origin}/media/share/${data.link?.token}`;
    await navigator.clipboard.writeText(url);
    setCopied(asset.id);
    setTimeout(() => setCopied(null), 2000);
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
        <button className="btn-primary-sm" onClick={() => setShowUpload(true)}>
          <CloudArrowUp size={14} /> Upload
        </button>
        <button className="btn-ghost" onClick={() => {/* TODO: new folder */}}>
          <FolderSimplePlus size={14} /> New Folder
        </button>
        <button className="btn-ghost" onClick={() => setShowTeam(true)}>
          <Users size={14} /> Team
        </button>

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
              <button
                key={f.id}
                className={`media-folder-item ${folderId === f.id ? "active" : ""}`}
                onClick={() => navigate(`/media/project/${projectId}/folder/${f.id}`)}
              >
                <FolderOpen size={14} weight="duotone" /> {f.name}
              </button>
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
                <AnimatePresence>
                  {filteredAssets.map((asset, i) => (
                    <AssetCard
                      key={asset.id}
                      asset={asset}
                      index={i}
                      onOpen={() => navigate(`/media/asset/${asset.id}`)}
                      onDelete={() => handleDeleteAsset(asset.id)}
                      onStatusChange={s => handleStatusChange(asset.id, s)}
                      onCopyLink={() => copyShareLink(asset)}
                      copied={copied === asset.id}
                      onShare={() => setShareAsset(asset)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <AssetListView
                assets={filteredAssets}
                onOpen={a => navigate(`/media/asset/${a.id}`)}
                onDelete={handleDeleteAsset}
                onStatusChange={handleStatusChange}
                onCopyLink={copyShareLink}
                copied={copied}
                onShare={setShareAsset}
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
          <TeamPanel
            projectId={projectId}
            onClose={() => setShowTeam(false)}
          />
        )}
      </AnimatePresence>

      {/* Share modal */}
      <AnimatePresence>
        {shareAsset && (
          <ShareModal
            asset={shareAsset}
            onClose={() => setShareAsset(null)}
          />
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}

/* ── Asset Card ─────────────────────────────────────────────────── */
function AssetCard({ asset, index, onOpen, onDelete, onStatusChange, onCopyLink, copied, onShare }) {
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
      className="media-asset-card"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ delay: index * 0.04, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      onClick={onOpen}
    >
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
        {asset.duration && (
          <span className="media-duration-badge">{formatDuration(asset.duration)}</span>
        )}
      </div>

      {/* Info */}
      <div className="media-asset-info">
        <span className="media-asset-name">{asset.name}</span>
        <span className="media-asset-meta">
          {asset.file_size ? formatSize(asset.file_size) : "—"}
        </span>
      </div>

      {/* Context menu */}
      <div className="card-menu" ref={menuRef} onClick={e => e.stopPropagation()}>
        <button className="card-menu-btn" onClick={() => setMenuOpen(m => !m)}>
          <DotsThree size={16} weight="bold" />
        </button>
        {menuOpen && (
          <div className="card-menu-dropdown">
            <button className="card-menu-item" onClick={() => { setMenuOpen(false); onOpen(); }}>
              <VideoCamera size={13} /> Open
            </button>
            <button className="card-menu-item" onClick={() => { setMenuOpen(false); onCopyLink(); }}>
              {copied ? <CheckCircle size={13} /> : <Copy size={13} />}
              {copied ? "Copied!" : "Copy link"}
            </button>
            <button className="card-menu-item" onClick={() => { setMenuOpen(false); onShare(); }}>
              <Link size={13} /> Share settings
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
function AssetListView({ assets, onOpen, onDelete, onStatusChange, onCopyLink, copied, onShare }) {
  return (
    <table className="file-list-table">
      <thead>
        <tr>
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
            <tr key={asset.id} className="file-list-row" onClick={() => onOpen(asset)} style={{ cursor: "pointer" }}>
              <td>
                <div className="file-list-name">
                  <AssetTypeIcon type={asset.type} size={16} />
                  {asset.name}
                </div>
              </td>
              <td>{asset.type}</td>
              <td><span className={`media-status-badge ${status.class}`}>{status.label}</span></td>
              <td>{asset.file_size ? formatSize(asset.file_size) : "—"}</td>
              <td>{asset.created_at ? new Date(asset.created_at).toLocaleDateString() : "—"}</td>
              <td onClick={e => e.stopPropagation()}>
                <button className="card-menu-btn" style={{ opacity: 1 }} onClick={() => onCopyLink(asset)}>
                  {copied === asset.id ? <CheckCircle size={14} /> : <Copy size={14} />}
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ── Helpers ── */
function AssetTypeIcon({ type, size = 24 }) {
  const props = { size, weight: "duotone" };
  if (type === "video")    return <VideoCamera {...props} style={{ color: "#a78bfa" }} />;
  if (type === "image")    return <FileImage   {...props} style={{ color: "#60a5fa" }} />;
  if (type === "audio")    return <FileAudio   {...props} style={{ color: "#34d399" }} />;
  return <File {...props} style={{ color: "#94a3b8" }} />;
}

function formatDuration(s) {
  if (!s) return "";
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
