import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, MagnifyingGlass, SquaresFour, Rows, Briefcase,
  DotsThree, PencilSimple, Trash, Clock, FolderPlus,
  CaretDown, Check,
} from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";
import DashboardLayout from "./DashboardLayout";
import { projectsApi } from "./lib/api";
import NewProjectModal from "./components/NewProjectModal";


const STATUS_OPTS = [
  { value: "active",    label: "Active",    cls: "swatch-active"    },
  { value: "completed", label: "Completed", cls: "swatch-completed" },
  { value: "on_hold",   label: "On Hold",   cls: "swatch-onhold"   },
  { value: "archived",  label: "Archived",  cls: "swatch-archived"  },
];

const STATUS_MAP = {
  active:    { label: "Active",    cls: "ps-active"    },
  completed: { label: "Completed", cls: "ps-completed" },
  on_hold:   { label: "On Hold",   cls: "ps-onhold"    },
  archived:  { label: "Archived",  cls: "ps-archived"  },
};

function isOverdue(due_date) {
  if (!due_date) return false;
  return new Date(due_date) < new Date();
}

export default function ProjectsPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [projects,    setProjects]   = useState([]);
  const [loading,     setLoading]    = useState(true);
  const [search,      setSearch]     = useState("");
  const [view,        setView]       = useState("grid");
  const [showNew,     setShowNew]    = useState(searchParams.get("new") === "1");
  const [menuOpen,    setMenuOpen]   = useState(null);
  const [statusMenu,  setStatusMenu] = useState(null);


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

  async function handleDelete(id) {
    if (!confirm("Delete this project? This cannot be undone.")) return;
    await projectsApi.delete(id).catch(() => {});
    setProjects(ps => ps.filter(p => p.id !== id));
    setMenuOpen(null);
  }

  async function handleStatusChange(projectId, status) {
    await projectsApi.update(projectId, { status }).catch(() => {});
    setProjects(ps => ps.map(p => p.id === projectId ? { ...p, status } : p));
    setStatusMenu(null);
  }

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.client_name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout title="Projects">
      <div className="projects-page" onClick={() => { setMenuOpen(null); setStatusMenu(null); }}>

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
            <button className={`icon-btn ${view === "grid" ? "active" : ""}`} onClick={() => setView("grid")} title="Grid view">
              <SquaresFour size={17} weight="duotone" />
            </button>
            <button className={`icon-btn ${view === "list" ? "active" : ""}`} onClick={() => setView("list")} title="List view">
              <Rows size={17} weight="duotone" />
            </button>
            <button className="proj-new-btn" onClick={() => setShowNew(true)}>
              <Plus size={15} weight="bold" />
              New Project
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="projects-loading">Loading projects…</div>
        ) : filtered.length === 0 && search ? (
          <div className="projects-empty">
            <Briefcase size={48} weight="duotone" style={{ opacity: 0.2 }} />
            <p>No projects match your search.</p>
          </div>
        ) : view === "grid" ? (
          <div className="projects-grid">
            {filtered.map((p, i) => {
              const statusMeta = STATUS_MAP[p.status] || STATUS_MAP.active;
              const overdue = isOverdue(p.due_date);
              return (
                <motion.div
                  key={p.id}
                  className="project-card"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => navigate(`/projects/${p.id}`)}
                >
                  {/* Color header */}
                  <div className="project-card-top" style={{ background: p.color || "#6366f1" }}>
                    <div className="project-card-top-overlay" />
                    <div className="project-card-top-content">
                      <div className="project-card-initials">
                        {p.name.slice(0, 2).toUpperCase()}
                      </div>
                    </div>
                  </div>

                  {/* 3-dot menu — outside of overflow:hidden top */}
                  <div className="project-card-menu-wrap" onClick={e => e.stopPropagation()}>
                    <button
                      className="project-card-menu-btn"
                      onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === p.id ? null : p.id); setStatusMenu(null); }}
                    >
                      <DotsThree size={18} weight="bold" />
                    </button>
                    {menuOpen === p.id && (
                      <div className="project-card-menu" onClick={e => e.stopPropagation()}>
                        <button onClick={() => { setMenuOpen(null); navigate(`/projects/${p.id}/settings`); }}>
                          <PencilSimple size={13} /> Edit Settings
                        </button>
                        <button className="danger" onClick={() => handleDelete(p.id)}>
                          <Trash size={13} /> Delete
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Body */}
                  <div className="project-card-body">
                    <div className="project-card-name">{p.name}</div>
                    {p.client_name && <div className="project-card-client">{p.client_name}</div>}

                    <div className="project-card-footer-row">
                      {/* Inline status badge — click to change */}
                      <div className="project-status-wrap" onClick={e => e.stopPropagation()}>
                        <button
                          className={`project-status-pill ${statusMeta.cls}`}
                          onClick={e => { e.stopPropagation(); setStatusMenu(statusMenu === p.id ? null : p.id); setMenuOpen(null); }}
                        >
                          {statusMeta.label}
                          <CaretDown size={9} style={{ marginLeft: 3 }} />
                        </button>
                        {statusMenu === p.id && (
                          <div className="project-status-dropdown">
                            {STATUS_OPTS.map(opt => (
                              <button
                                key={opt.value}
                                className={`psd-opt ${p.status === opt.value ? "active" : ""}`}
                                onClick={() => handleStatusChange(p.id, opt.value)}
                              >
                                <span className={`psd-dot ${opt.cls}`} />
                                {opt.label}
                                {p.status === opt.value && <Check size={11} style={{ marginLeft: "auto" }} />}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Due date */}
                      {p.due_date && (
                        <span className={`project-due-date ${overdue ? "overdue" : ""}`}>
                          <Clock size={11} />
                          {overdue ? "Overdue · " : ""}
                          {new Date(p.due_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}

            {/* New Project card */}
            <motion.div
              className="project-card-new"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: filtered.length * 0.04 }}
              onClick={() => setShowNew(true)}
            >
              <FolderPlus size={28} weight="duotone" style={{ color: "var(--t4)" }} />
              <span>New Project</span>
            </motion.div>
          </div>
        ) : (
          /* List view */
          <div className="projects-list">
            <div className="projects-list-header">
              <span>Name</span><span>Client</span><span>Status</span><span>Due Date</span><span />
            </div>
            {filtered.map(p => {
              const statusMeta = STATUS_MAP[p.status] || STATUS_MAP.active;
              const overdue = isOverdue(p.due_date);
              return (
                <div key={p.id} className="projects-list-row" onClick={() => navigate(`/projects/${p.id}`)}>
                  <span className="project-list-name">
                    <span className="project-list-dot" style={{ background: p.color || "#6366f1" }} />
                    {p.name}
                  </span>
                  <span className="project-list-client">{p.client_name || "—"}</span>
                  <span>
                    <div className="project-status-wrap" onClick={e => e.stopPropagation()}>
                      <button
                        className={`project-status-pill ${statusMeta.cls}`}
                        onClick={e => { e.stopPropagation(); setStatusMenu(statusMenu === p.id ? null : p.id); }}
                      >
                        {statusMeta.label} <CaretDown size={9} style={{ marginLeft: 3 }} />
                      </button>
                      {statusMenu === p.id && (
                        <div className="project-status-dropdown">
                          {STATUS_OPTS.map(opt => (
                            <button
                              key={opt.value}
                              className={`psd-opt ${p.status === opt.value ? "active" : ""}`}
                              onClick={() => handleStatusChange(p.id, opt.value)}
                            >
                              <span className={`psd-dot ${opt.cls}`} />
                              {opt.label}
                              {p.status === opt.value && <Check size={11} style={{ marginLeft: "auto" }} />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </span>
                  <span className={`project-due-date ${overdue ? "overdue" : ""}`}>
                    {p.due_date ? (
                      <><Clock size={11} />{overdue ? "Overdue · " : ""}{new Date(p.due_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</>
                    ) : "—"}
                  </span>
                  <span onClick={e => e.stopPropagation()} style={{ position: "relative" }}>
                    <button className="icon-btn" onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === p.id ? null : p.id); }}>
                      <DotsThree size={16} />
                    </button>
                    {menuOpen === p.id && (
                      <div className="project-card-menu" style={{ right: 0, top: 32 }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => { setMenuOpen(null); navigate(`/projects/${p.id}/settings`); }}>
                          <PencilSimple size={13} /> Edit Settings
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

        <AnimatePresence>
          {showNew && <NewProjectModal onClose={() => setShowNew(false)} />}
        </AnimatePresence>
      </div>
    </DashboardLayout>
  );
}
