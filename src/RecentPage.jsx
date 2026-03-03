import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CloudArrowUp, SquaresFour, Rows } from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";
import DashboardLayout from "./DashboardLayout";
import FileGrid from "./components/FileGrid";
import FileList from "./components/FileList";
import MoveFolderModal from "./components/MoveFolderModal";
import { userApiFetch } from "./lib/userApi";

export default function RecentPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [shares, setShares]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView]       = useState("grid");
  const [moveToken, setMoveToken] = useState(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login", { replace: true });
  }, [user, authLoading]);

  useEffect(() => {
    if (!user) return;
    userApiFetch("/api/user/files?limit=20")
      .then(d => setShares(d.shares || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  async function handleTrash(token) {
    await userApiFetch(`/api/user/share/${token}`, { method: "PUT", body: JSON.stringify({ action: "trash" }) });
    setShares(s => s.filter(sh => sh.token !== token));
  }

  async function handleDelete({ type, token }) {
    if (type !== "share") return;
    if (!window.confirm("Permanently delete? This cannot be undone.")) return;
    await userApiFetch(`/api/user/share/${token}`, { method: "DELETE" });
    setShares(s => s.filter(sh => sh.token !== token));
  }

  async function handleRename(token, name) {
    await userApiFetch(`/api/user/share/${token}`, { method: "PUT", body: JSON.stringify({ action: "rename", name }) });
    setShares(s => s.map(sh => sh.token === token
      ? { ...sh, files: sh.files.map((f, i) => i === 0 ? { ...f, name } : f) }
      : sh
    ));
  }

  const viewProps = {
    shares, folders: [],
    onTrash: handleTrash,
    onDelete: handleDelete,
    onRename: handleRename,
    onMove: token => setMoveToken(token),
  };

  return (
    <DashboardLayout title="Recent">
      <div className="files-toolbar">
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
      ) : shares.length === 0 ? (
        <div className="empty-state">
          <CloudArrowUp size={40} weight="thin" />
          <p>No recent uploads</p>
          <button className="btn-primary-sm" onClick={() => navigate("/")}>Upload files</button>
        </div>
      ) : view === "grid" ? (
        <FileGrid {...viewProps} />
      ) : (
        <FileList {...viewProps} />
      )}

      {moveToken && (
        <MoveFolderModal
          token={moveToken}
          onMoved={() => { setMoveToken(null); userApiFetch("/api/user/files?limit=20").then(d => setShares(d.shares || [])); }}
          onClose={() => setMoveToken(null)}
        />
      )}
    </DashboardLayout>
  );
}
