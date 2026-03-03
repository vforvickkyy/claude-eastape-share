import React, { useState, useEffect } from "react";
import { X, FolderOpen } from "@phosphor-icons/react";
import { userApiFetch } from "../lib/userApi";

export default function MoveFolderModal({ token, onMoved, onClose }) {
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving]   = useState(false);

  useEffect(() => {
    userApiFetch("/api/user/folders")
      .then(d => setFolders(d.folders || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function move(folderId) {
    setMoving(true);
    try {
      await userApiFetch(`/api/user/share/${token}`, {
        method: "PUT",
        body: JSON.stringify({ action: "move", folderId }),
      });
      onMoved(folderId);
    } catch (err) {
      console.error(err);
    } finally {
      setMoving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card glass-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <FolderOpen size={18} weight="duotone" />
          <span>Move to Folder</span>
          <button className="modal-close" onClick={onClose}><X size={15} /></button>
        </div>
        {loading ? (
          <p style={{ color: "var(--t2)", fontSize: 13 }}>Loading folders…</p>
        ) : (
          <div className="folder-picker">
            <button className="folder-pick-item" onClick={() => move(null)} disabled={moving}>
              <FolderOpen size={15} weight="duotone" /> Root
            </button>
            {folders.map(f => (
              <button key={f.id} className="folder-pick-item" onClick={() => move(f.id)} disabled={moving}>
                <FolderOpen size={15} weight="duotone" /> {f.name}
              </button>
            ))}
            {folders.length === 0 && (
              <p style={{ color: "var(--t2)", fontSize: 13 }}>No folders yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
