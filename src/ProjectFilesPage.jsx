import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  UploadSimple, FolderSimplePlus, MagnifyingGlass, Rows, SquaresFour,
  File, FolderOpen, Trash, PencilSimple, DownloadSimple, CheckCircle,
  X, CaretRight, House,
} from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";
import { useProject } from "./context/ProjectContext";
import { projectFilesApi, projectFoldersApi, formatSize } from "./lib/api";

const CATEGORIES = ["all", "document", "image", "video", "audio", "archive", "other"];

export default function ProjectFilesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id: projectId, folderId } = useParams();
  const { isOwner } = useProject();

  const [files,     setFiles]     = useState([]);
  const [folders,   setFolders]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [category,  setCategory]  = useState("all");
  const [view,      setView]      = useState("list");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renameFile, setRenameFile] = useState(null);
  const [renameVal,  setRenameVal]  = useState("");
  const [dragOver,   setDragOver]   = useState(false);
  const [uploading,  setUploading]  = useState(false);

  const load = useCallback(() => {
    if (!user || !projectId) return;
    setLoading(true);
    Promise.all([
      projectFoldersApi.list(projectId).then(d => (d.folders || []).filter(f => (f.parent_id || null) === (folderId || null))).catch(() => []),
      projectFilesApi.list({ projectId, folderId: folderId || "root" }).then(d => d.files || []).catch(() => []),
    ]).then(([fo, fi]) => { setFolders(fo); setFiles(fi); }).finally(() => setLoading(false));
  }, [user, projectId, folderId]);

  useEffect(() => { load(); }, [load]);

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    const data = await projectFoldersApi.create({ name, project_id: projectId, parent_id: folderId || null }).catch(() => null);
    if (data?.folder) setFolders(fs => [...fs, data.folder]);
    setShowNewFolder(false); setNewFolderName("");
  }

  async function handleRename() {
    const name = renameVal.trim();
    if (!name || name === renameFile.name) { setRenameFile(null); return; }
    await projectFilesApi.update(renameFile.id, { name }).catch(() => {});
    setFiles(fs => fs.map(f => f.id === renameFile.id ? { ...f, name } : f));
    setRenameFile(null);
  }

  async function handleDelete(id) {
    if (!confirm("Delete this file?")) return;
    await projectFilesApi.delete(id).catch(() => {});
    setFiles(fs => fs.filter(f => f.id !== id));
  }

  async function handleDownload(file) {
    try {
      const { url } = await projectFilesApi.getDownloadUrl(file.id);
      if (!url) return;
      const a = document.createElement("a"); a.href = url; a.download = file.name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } catch {}
  }

  async function handleFileDrop(e) {
    e.preventDefault(); setDragOver(false);
    const droppedFiles = [...e.dataTransfer.files];
    if (!droppedFiles.length) return;
    await uploadFiles(droppedFiles);
  }

  async function handleFileInput(e) {
    const selected = [...e.target.files];
    if (!selected.length) return;
    await uploadFiles(selected);
    e.target.value = "";
  }

  async function uploadFiles(fileList) {
    setUploading(true);
    for (const file of fileList) {
      try {
        const { upload_url, file: created } = await projectFilesApi.presign({
          file_name: file.name, file_size: file.size, mime_type: file.type,
          project_id: projectId, folder_id: folderId || null,
        });
        await fetch(upload_url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        if (created) setFiles(fs => [created, ...fs]);
      } catch {}
    }
    setUploading(false);
    load();
  }

  const filtered = files.filter(f => {
    const matchSearch = f.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === "all" || f.file_category === category;
    return matchSearch && matchCat;
  });

  return (
    <div
      className={`project-files-tab ${dragOver ? "drag-over" : ""}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleFileDrop}
    >
      {/* Toolbar */}
      <div className="mpv-toolbar">
        <div className="mpv-search-wrap">
          <MagnifyingGlass size={14} />
          <input
            className="mpv-search"
            placeholder="Search files…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="mpv-filter-select"
          value={category}
          onChange={e => setCategory(e.target.value)}
        >
          {CATEGORIES.map(c => (
            <option key={c} value={c}>{c === "all" ? "All Types" : c.charAt(0).toUpperCase() + c.slice(1)}</option>
          ))}
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
        <label className="btn-primary" style={{ cursor: "pointer" }}>
          <UploadSimple size={14} weight="bold" />
          {uploading ? "Uploading…" : "Upload"}
          <input type="file" multiple style={{ display: "none" }} onChange={handleFileInput} />
        </label>
      </div>

      {/* Breadcrumb */}
      {folderId && (
        <div className="mpv-breadcrumb">
          <button onClick={() => navigate(`/projects/${projectId}/files`)}>
            <House size={13} /> Root
          </button>
          <CaretRight size={11} />
          <span>Folder</span>
        </div>
      )}

      {/* Drag overlay */}
      {dragOver && (
        <div className="drag-overlay">
          <UploadSimple size={36} weight="duotone" />
          <p>Drop files to upload</p>
        </div>
      )}

      {loading ? <div className="mpv-loading">Loading…</div> : (
        <>
          {/* Folders */}
          {folders.length > 0 && (
            <div className="mpv-folders-row">
              {folders.map(f => (
                <div
                  key={f.id}
                  className="mpv-folder-chip"
                  onClick={() => navigate(`/projects/${projectId}/files/folder/${f.id}`)}
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

          {filtered.length === 0 && (
            <div className="mpv-empty">
              <File size={48} weight="duotone" style={{ opacity: 0.2 }} />
              <p>{search || category !== "all" ? "No files match your filters." : "No files yet. Upload or drag files here."}</p>
            </div>
          )}

          {view === "list" && filtered.length > 0 && (
            <div className="mpv-list">
              <div className="mpv-list-header">
                <span>Name</span><span>Type</span><span>Size</span><span>Added</span><span />
              </div>
              {filtered.map(file => (
                <div key={file.id} className="mpv-list-row">
                  <span className="mpv-list-name">
                    <File size={15} weight="duotone" style={{ flexShrink: 0 }} />
                    {renameFile?.id === file.id ? (
                      <input
                        className="mpv-rename-input"
                        value={renameVal}
                        onChange={e => setRenameVal(e.target.value)}
                        onBlur={handleRename}
                        onKeyDown={e => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setRenameFile(null); }}
                        autoFocus
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <span>{file.name}</span>
                    )}
                  </span>
                  <span>{file.file_category || "—"}</span>
                  <span>{file.file_size ? formatSize(file.file_size) : "—"}</span>
                  <span>{new Date(file.created_at).toLocaleDateString()}</span>
                  <span style={{ display: "flex", gap: 6 }}>
                    <button title="Download" onClick={() => handleDownload(file)}><DownloadSimple size={14} /></button>
                    <button title="Rename" onClick={() => { setRenameFile(file); setRenameVal(file.name); }}><PencilSimple size={14} /></button>
                    {isOwner && <button title="Delete" onClick={() => handleDelete(file.id)}><Trash size={14} /></button>}
                  </span>
                </div>
              ))}
            </div>
          )}

          {view === "grid" && filtered.length > 0 && (
            <div className="mpv-grid">
              {filtered.map(file => (
                <div key={file.id} className="mpv-card">
                  <div className="mpv-card-thumb mpv-card-file-icon">
                    <File size={36} weight="duotone" style={{ opacity: 0.5 }} />
                  </div>
                  <div className="mpv-card-footer">
                    <span className="mpv-card-name" title={file.name}>{file.name}</span>
                    {file.file_size && <span className="mpv-card-size">{formatSize(file.file_size)}</span>}
                    <div className="mpv-card-actions">
                      <button onClick={() => handleDownload(file)}><DownloadSimple size={13} /></button>
                      <button onClick={() => { setRenameFile(file); setRenameVal(file.name); }}><PencilSimple size={13} /></button>
                      {isOwner && <button onClick={() => handleDelete(file.id)}><Trash size={13} /></button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
