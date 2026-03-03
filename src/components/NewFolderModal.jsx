import React, { useState, useEffect, useRef } from "react";
import { X, FolderSimplePlus } from "@phosphor-icons/react";
import { userApiFetch } from "../lib/userApi";

export default function NewFolderModal({ parentId, onCreated, onClose }) {
  const [name, setName]       = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true); setError("");
    try {
      const { folder } = await userApiFetch("/api/user/folders", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), parentId }),
      });
      onCreated(folder);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card glass-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <FolderSimplePlus size={18} weight="duotone" />
          <span>New Folder</span>
          <button className="modal-close" onClick={onClose}><X size={15} /></button>
        </div>
        {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            className="form-input"
            style={{ width: "100%", marginBottom: 14 }}
            placeholder="Folder name"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={120}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary-sm" disabled={loading || !name.trim()}>
              {loading ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
