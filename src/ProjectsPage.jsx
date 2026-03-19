import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, MagnifyingGlass, SquaresFour, Rows, Briefcase,
  DotsThree, PencilSimple, Trash, Clock, X,
} from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";
import DashboardLayout from "./DashboardLayout";
import { projectsApi } from "./lib/api";

const COLOR_OPTS = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#14b8a6"];

const STATUS_MAP = {
  active:    { label: "Active",    cls: "badge-approved" },
  archived:  { label: "Archived",  cls: "badge-revision" },
  completed: { label: "Completed", cls: "badge-review"   },
  on_hold:   { label: "On Hold",   cls: "badge-neutral"  },
};

export default function ProjectsPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [projects, setProjects] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const [view,     setView]     = useState("grid");
  const [showNew,  setShowNew]  = useState(searchParams.get("new") === "1");
  const [menuOpen, setMenuOpen] = useState(null);

  const [newName,   setNewName]   = useState("");
  const [newColor,  setNewColor]  = useState(COLOR_OPTS[0]);
  const [newClient, setNewClient] = useState("");
  const [creating,  setCreating]  = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login", { replace: true });
  }, [user, authLoading]);

  const load = useCallback(() => {
    if (!user) return;
    setLoading(true);
    projectsApi.list()
      .then(d => setProjects(d.projects || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const d = await projectsApi.create({ name: newName.trim(), color: newColor, client_name: newClient });
      const created = d.project;
      setShowNew(false);
      setNewName(""); setNewClient(""); setNewColor(COLOR_OPTS[0]);
      if (created?.id) navigate(`/projects/${created.id}`);
      else load();
    } catch { setCreating(false); }
    finally { setCreating(false); }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this project? This cannot be undone.")) return;
    await projectsApi.delete(id).catch(() => {});
    setProjects(ps => ps.filter(p => p.id !== id));
    setMenuOpen(null);
  }

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.client_name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout title="Projects">
      <div className="projects-page">
        {/* Toolbar */}
        <div className="projects-toolbar">
          <div className="projects-search-wrap">
            <MagnifyingGlass size={15} />
            <input
              className="projects-search"
              placeholder="Search projects..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="projects-toolbar-right">
            <button
              className={`icon-btn ${view === "grid" ? "active" : ""}`}
              onClick={() => setView("grid")}
              title="Grid view"
            >
              <SquaresFour size={17} weight="duotone" />
            </button>
            <button
              className={`icon-btn ${view === "list" ? "active" : ""}`}
              onClick={() => setView("list")}
              title="List view"
            >
              <Rows size={17} weight="duotone" />
            </button>
            <button className="btn-primary" onClick={() => setShowNew(true)}>
              <Plus size={15} weight="bold" />
              New Project
            </button>
          </div>
        </div>

        {/* Grid / List */}
        {loading ? (
          <div className="projects-loading">Loading projects…</div>
        ) : filtered.length === 0 ? (
          <div className="projects-empty">
            <Briefcase size={48} weight="duotone" style={{ opacity: 0.25 }} />
            <p>{search ? "No projects match your search." : "No projects yet. Create your first project."}</p>
            {!search && (
              <button className="btn-primary" onClick={() => setShowNew(true)}>
                <Plus size={14} weight="bold" /> New Project
              </button>
            )}
          </div>
        ) : view === "grid" ? (
          <div className="projects-grid">
            {filtered.map((p, i) => {
              const status = STATUS_MAP[p.status];
              return (
                <motion.div
                  key={p.id}
                  className="project-card"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => navigate(`/projects/${p.id}`)}
                >
                  <div className="project-card-top" style={{ background: p.color || "#6366f1" }}>
                    <button
                      className="project-card-menu-btn"
                      onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === p.id ? null : p.id); }}
                    >
                      <DotsThree size={18} weight="bold" />
                    </button>
                    {menuOpen === p.id && (
                      <div className="project-card-menu" onClick={e => e.stopPropagation()}>
                        <button onClick={() => { setMenuOpen(null); navigate(`/projects/${p.id}/settings`); }}>
                          <PencilSimple size={13} /> Edit
                        </button>
                        <button className="danger" onClick={() => handleDelete(p.id)}>
                          <Trash size={13} /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="project-card-body">
                    <div className="project-card-name">{p.name}</div>
                    {p.client_name && <div className="project-card-client">{p.client_name}</div>}
                    <div className="project-card-footer-row">
                      {status && (
                        <span className={`project-status-pill ${status.cls}`}>{status.label}</span>
                      )}
                      {p.due_date && (
                        <span className="project-due-date">
                          <Clock size={11} />
                          {new Date(p.due_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="projects-list">
            <div className="projects-list-header">
              <span>Name</span>
              <span>Client</span>
              <span>Status</span>
              <span>Due Date</span>
              <span />
            </div>
            {filtered.map(p => {
              const status = STATUS_MAP[p.status];
              return (
                <div
                  key={p.id}
                  className="projects-list-row"
                  onClick={() => navigate(`/projects/${p.id}`)}
                >
                  <span className="project-list-name">
                    <span className="project-list-dot" style={{ background: p.color || "#6366f1" }} />
                    {p.name}
                  </span>
                  <span className="project-list-client">{p.client_name || "—"}</span>
                  <span>
                    {status && <span className={`project-status-pill ${status.cls}`}>{status.label}</span>}
                  </span>
                  <span>{p.due_date ? new Date(p.due_date).toLocaleDateString() : "—"}</span>
                  <span>
                    <button
                      className="icon-btn"
                      onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === p.id ? null : p.id); }}
                    >
                      <DotsThree size={16} />
                    </button>
                    {menuOpen === p.id && (
                      <div className="project-card-menu" onClick={e => e.stopPropagation()}>
                        <button onClick={() => { setMenuOpen(null); navigate(`/projects/${p.id}/settings`); }}>
                          <PencilSimple size={13} /> Edit
                        </button>
                        <button className="danger" onClick={() => handleDelete(p.id)}>
                          <Trash size={13} /> Delete
                        </button>
                      </div>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* New Project Modal */}
        <AnimatePresence>
          {showNew && (
            <motion.div
              className="modal-overlay"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowNew(false)}
            >
              <motion.div
                className="modal-box"
                style={{ maxWidth: 420 }}
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.92, opacity: 0 }}
                onClick={e => e.stopPropagation()}
              >
                <div className="modal-header">
                  <h3>New Project</h3>
                  <button className="modal-close" onClick={() => setShowNew(false)}><X size={16} /></button>
                </div>
                <form onSubmit={handleCreate} className="new-project-form">
                  <label>Project Name *</label>
                  <input
                    className="input-field"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="e.g. Brand Campaign 2025"
                    required
                    autoFocus
                  />

                  <label>Client Name</label>
                  <input
                    className="input-field"
                    value={newClient}
                    onChange={e => setNewClient(e.target.value)}
                    placeholder="Optional"
                  />

                  <label>Color</label>
                  <div className="color-picker-row">
                    {COLOR_OPTS.map(c => (
                      <button
                        key={c} type="button"
                        className={`color-swatch ${newColor === c ? "selected" : ""}`}
                        style={{ background: c }}
                        onClick={() => setNewColor(c)}
                      />
                    ))}
                  </div>

                  <div className="modal-actions">
                    <button type="button" className="btn-ghost" onClick={() => setShowNew(false)}>Cancel</button>
                    <button type="submit" className="btn-primary" disabled={creating || !newName.trim()}>
                      {creating ? "Creating…" : "Create Project"}
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DashboardLayout>
  );
}
