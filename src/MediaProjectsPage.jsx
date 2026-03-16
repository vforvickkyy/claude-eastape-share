import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  VideoCamera, Plus, FolderOpen, DotsThree, PencilSimple,
  Trash, Users, ArrowRight, MagnifyingGlass, X,
} from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";
import DashboardLayout from "./DashboardLayout";
import { userApiFetch } from "./lib/userApi";

const PROJECT_COLORS = [
  "#7c3aed","#2563eb","#059669","#d97706","#dc2626",
  "#0891b2","#7c3aed","#be185d","#65a30d","#9333ea",
];

const CARD_VARIANTS = {
  hidden:  { opacity: 0, scale: 0.96, y: 12 },
  visible: i => ({
    opacity: 1, scale: 1, y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }
  }),
};

export default function MediaProjectsPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [showNew, setShowNew]   = useState(false);
  const [menuId, setMenuId]     = useState(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login", { replace: true });
  }, [user, authLoading]);

  useEffect(() => {
    if (!user) return;
    fetchProjects();
  }, [user]);

  function fetchProjects() {
    setLoading(true);
    userApiFetch("/api/media/projects")
      .then(d => setProjects(d.projects || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  async function deleteProject(id) {
    if (!window.confirm("Delete this project and all its assets? This cannot be undone.")) return;
    await userApiFetch(`/api/media/projects?id=${id}`, { method: "DELETE" });
    setProjects(ps => ps.filter(p => p.id !== id));
  }

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout title="Media">
      {/* Top bar */}
      <div className="media-topbar">
        <div className="media-search-wrap">
          <MagnifyingGlass size={14} className="media-search-icon" />
          <input
            className="media-search"
            placeholder="Search projects…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="media-search-clear" onClick={() => setSearch("")}>
              <X size={13} />
            </button>
          )}
        </div>
        <button className="btn-primary-sm" onClick={() => setShowNew(true)}>
          <Plus size={14} weight="bold" /> New Project
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="empty-state"><span className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <VideoCamera size={44} weight="thin" />
          <p>{search ? "No projects match your search" : "No media projects yet"}</p>
          {!search && (
            <button className="btn-primary-sm" onClick={() => setShowNew(true)}>
              <Plus size={13} weight="bold" /> Create your first project
            </button>
          )}
        </div>
      ) : (
        <div className="media-projects-grid">
          {filtered.map((p, i) => (
            <motion.div
              key={p.id}
              className="media-project-card"
              custom={i}
              variants={CARD_VARIANTS}
              initial="hidden"
              animate="visible"
              onClick={() => navigate(`/media/project/${p.id}`)}
            >
              {/* Color bar */}
              <div className="media-project-bar" style={{ background: p.color || "#7c3aed" }} />

              <div className="media-project-body">
                <div className="media-project-header">
                  <span className="media-project-dot" style={{ background: p.color || "#7c3aed" }} />
                  <span className="media-project-name">{p.name}</span>
                  <button
                    className="card-menu-btn"
                    onClick={e => { e.stopPropagation(); setMenuId(menuId === p.id ? null : p.id); }}
                  >
                    <DotsThree size={16} weight="bold" />
                  </button>
                  {menuId === p.id && (
                    <ProjectMenu
                      project={p}
                      onEdit={() => { setMenuId(null); /* TODO: edit modal */ }}
                      onDelete={() => { setMenuId(null); deleteProject(p.id); }}
                      onClose={() => setMenuId(null)}
                    />
                  )}
                </div>

                {p.description && (
                  <p className="media-project-desc">{p.description}</p>
                )}

                <div className="media-project-meta">
                  <span className="media-project-stat">
                    <FolderOpen size={12} /> {p.media_assets?.[0]?.count ?? 0} assets
                  </span>
                  <span className="media-project-stat">
                    <Users size={12} /> {p.media_team_members?.[0]?.count ?? 0} members
                  </span>
                </div>

                <div className="media-project-footer">
                  <span className="media-project-date">
                    Updated {timeAgo(p.updated_at)}
                  </span>
                  <ArrowRight size={13} className="media-project-arrow" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* New project modal */}
      <AnimatePresence>
        {showNew && (
          <NewProjectModal
            onCreated={proj => { setProjects(ps => [proj, ...ps]); setShowNew(false); }}
            onClose={() => setShowNew(false)}
          />
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}

/* ── Context menu ── */
function ProjectMenu({ project, onEdit, onDelete, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="card-menu-dropdown media-project-menu" ref={ref} onClick={e => e.stopPropagation()}>
      <button className="card-menu-item" onClick={onEdit}>
        <PencilSimple size={13} /> Edit project
      </button>
      <button className="card-menu-item danger" onClick={onDelete}>
        <Trash size={13} /> Delete project
      </button>
    </div>
  );
}

/* ── New project modal ── */
function NewProjectModal({ onCreated, onClose }) {
  const [name, setName]   = useState("");
  const [desc, setDesc]   = useState("");
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [saving, setSaving] = useState(false);

  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const data = await userApiFetch("/api/media/projects", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), description: desc.trim(), color }),
      });
      onCreated(data.project);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="modal-card glass-card"
        style={{ maxWidth: 400 }}
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.94, opacity: 0 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <VideoCamera size={18} weight="duotone" />
          New Media Project
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        <form onSubmit={handleCreate}>
          <div className="form-group">
            <label className="form-label">Project name</label>
            <input
              className="form-input"
              placeholder="e.g. Brand Campaign 2026"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="form-group" style={{ marginTop: 12 }}>
            <label className="form-label">Description (optional)</label>
            <input
              className="form-input"
              placeholder="What is this project about?"
              value={desc}
              onChange={e => setDesc(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginTop: 12 }}>
            <label className="form-label">Color</label>
            <div className="color-picker-row">
              {PROJECT_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`color-swatch ${color === c ? "active" : ""}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary-sm" disabled={saving || !name.trim()}>
              {saving ? <><span className="spinner" /> Creating…</> : "Create Project"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

/* ── helpers ── */
function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
