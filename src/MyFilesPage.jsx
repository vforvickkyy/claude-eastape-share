import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CloudArrowUp, FolderSimplePlus, SquaresFour, Rows, House, CaretRight } from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";
import DashboardLayout from "./DashboardLayout";
import FileGrid from "./components/FileGrid";
import FileList from "./components/FileList";
import NewFolderModal from "./components/NewFolderModal";
import MoveFolderModal from "./components/MoveFolderModal";
import { userApiFetch } from "./lib/userApi";

export default function MyFilesPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate  = useNavigate();
  const { id: folderId } = useParams();  // /my-files/folder/:id

  const [shares, setShares]         = useState([]);
  const [folders, setFolders]       = useState([]);
  const [breadcrumb, setBreadcrumb]  = useState([]);  // [{id, name}]
  const [loading, setLoading]        = useState(true);
  const [view, setView]              = useState("grid"); // grid | list
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [moveToken, setMoveToken]    = useState(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login", { replace: true });
  }, [user, authLoading]);

  const load = useCallback(() => {
    if (!user) return;
    setLoading(true);
    const qs = folderId ? `?folderId=${folderId}` : "";
    userApiFetch(`/api/user/files${qs}`)
      .then(d => { setShares(d.shares || []); setFolders(d.folders || []); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user, folderId]);

  useEffect(() => { load(); }, [load]);

  // Build breadcrumb from URL param — simplified (single level for now)
  useEffect(() => {
    if (!folderId) { setBreadcrumb([]); return; }
    userApiFetch(`/api/user/folders?parentId=none`)
      .then(d => {
        const all = d.folders || [];
        const found = all.find(f => f.id === folderId);
        setBreadcrumb(found ? [{ id: found.id, name: found.name }] : []);
      })
      .catch(() => {});
  }, [folderId]);

  async function handleTrash(token) {
    await userApiFetch(`/api/user/share/${token}`, { method: "PUT", body: JSON.stringify({ action: "trash" }) });
    setShares(s => s.filter(sh => sh.token !== token));
  }

  async function handleDelete({ type, token, id }) {
    if (!window.confirm("Permanently delete? This cannot be undone.")) return;
    if (type === "share") {
      await userApiFetch(`/api/user/share/${token}`, { method: "DELETE" });
      setShares(s => s.filter(sh => sh.token !== token));
    } else {
      // folder delete — just remove from DB (files inside stay at root)
      await userApiFetch(`/api/user/folders`, { method: "DELETE", body: JSON.stringify({ id }) }).catch(() => {});
      setFolders(f => f.filter(fo => fo.id !== id));
    }
  }

  const viewProps = {
    shares, folders, isTrash: false,
    onFolderClick: f => navigate(`/my-files/folder/${f.id}`),
    onTrash: handleTrash,
    onDelete: handleDelete,
    onMove: token => setMoveToken(token),
  };

  return (
    <DashboardLayout title="My Files">
      {/* Breadcrumb */}
      <div className="breadcrumb">
        <button className="breadcrumb-item" onClick={() => navigate("/my-files")}>
          <House size={13} /> Root
        </button>
        {breadcrumb.map(crumb => (
          <React.Fragment key={crumb.id}>
            <CaretRight size={11} className="breadcrumb-sep" />
            <span className="breadcrumb-item active">{crumb.name}</span>
          </React.Fragment>
        ))}
      </div>

      {/* Toolbar */}
      <div className="files-toolbar">
        <button className="btn-primary-sm" onClick={() => setShowNewFolder(true)}>
          <FolderSimplePlus size={14} /> New Folder
        </button>
        <button className="btn-ghost" onClick={() => navigate("/")}>
          <CloudArrowUp size={14} /> Upload Files
        </button>
        <div className="view-toggle" style={{ marginLeft: "auto" }}>
          <button className={`view-btn ${view === "grid" ? "active" : ""}`} onClick={() => setView("grid")} title="Grid view">
            <SquaresFour size={16} />
          </button>
          <button className={`view-btn ${view === "list" ? "active" : ""}`} onClick={() => setView("list")} title="List view">
            <Rows size={16} />
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="empty-state"><span className="spinner" /></div>
      ) : shares.length === 0 && folders.length === 0 ? (
        <div className="empty-state">
          <CloudArrowUp size={40} weight="thin" />
          <p>No files here yet</p>
          <button className="btn-primary-sm" onClick={() => navigate("/")}>Upload files</button>
        </div>
      ) : view === "grid" ? (
        <FileGrid {...viewProps} />
      ) : (
        <FileList {...viewProps} />
      )}

      {showNewFolder && (
        <NewFolderModal
          parentId={folderId || null}
          onCreated={folder => { setFolders(f => [folder, ...f]); setShowNewFolder(false); }}
          onClose={() => setShowNewFolder(false)}
        />
      )}

      {moveToken && (
        <MoveFolderModal
          token={moveToken}
          onMoved={() => { load(); setMoveToken(null); }}
          onClose={() => setMoveToken(null)}
        />
      )}
    </DashboardLayout>
  );
}
