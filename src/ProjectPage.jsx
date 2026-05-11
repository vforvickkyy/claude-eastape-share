import React, { useEffect } from "react";
import { useNavigate, useParams, useLocation, Routes, Route, NavLink, Navigate } from "react-router-dom";
import {
  FolderOpen, Users, ShareNetwork, Gear, ArrowLeft, Kanban,
  VideoCamera, Clock, UserPlus, FilmSlate,
} from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";
import { useProject } from "./context/ProjectContext";
import DashboardLayout from "./DashboardLayout";
import ProjectFilesPage    from "./ProjectFilesPage";
import ProjectMediaPage    from "./ProjectMediaPage";
import ProjectTeamPage     from "./ProjectTeamPage";
import ProjectSharingPage  from "./ProjectSharingPage";
import ProjectSettingsPage from "./ProjectSettingsPage";
import ManageTab           from "./components/production/ManageTab";

export default function ProjectPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const {
    project, loading: projLoading, fileCounts,
    canManageSettings, canManageSharing,
  } = useProject();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login", { replace: true });
  }, [user, authLoading]);

  const TABS = [
    { path: "files",    label: "Files",   icon: <FolderOpen   size={14} weight="duotone" />, count: fileCounts?.file_count   ?? null },
    { path: "media",    label: "Media",   icon: <VideoCamera  size={14} weight="duotone" />, count: fileCounts?.media_count  ?? null },
    { path: "manage",   label: "Manage",  icon: <Kanban       size={14} weight="duotone" />, count: null },
    { path: "team",     label: "Team",    icon: <Users        size={14} weight="duotone" />, count: fileCounts?.member_count ?? null },
    ...(canManageSharing  ? [{ path: "sharing",  label: "Share",    icon: <ShareNetwork size={14} weight="duotone" />, count: null }] : []),
    ...(canManageSettings ? [{ path: "settings", label: "Settings", icon: <Gear         size={14} weight="duotone" />, count: null }] : []),
  ];

  const projectTitle = projLoading ? "Loading…" : project?.name || "Project";
  const accentColor  = project?.color || "var(--accent)";

  const labelParts = [
    project?.client_name?.toUpperCase(),
    project?.project_type?.toUpperCase() || project?.type?.toUpperCase(),
  ].filter(Boolean).join(" · ");

  const dueDate = project?.due_date
    ? new Date(project.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <DashboardLayout title={projectTitle}>
      <div className="project-page">

        {/* Breadcrumb */}
        <div className="project-breadcrumb">
          <button className="breadcrumb-back" onClick={() => navigate("/projects")}>
            <ArrowLeft size={14} />
            Projects
          </button>
          {project && (
            <>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-current">{project.name}</span>
            </>
          )}
        </div>

        {/* Hero */}
        {project && (
          <div className="proj-hero">
            <div className="proj-hero-thumb" style={{
              background: `linear-gradient(135deg,
                color-mix(in oklch, ${accentColor} 55%, #0a0a0c),
                color-mix(in oklch, ${accentColor} 20%, #0a0a0c))`,
            }}>
              <FilmSlate size={28} weight="duotone" style={{ opacity: 0.5 }} />
            </div>

            <div className="proj-hero-info">
              {labelParts && <div className="proj-hero-label">{labelParts}</div>}
              <h1 className="proj-hero-title">{project.name}</h1>
              <div className="proj-hero-meta">
                {fileCounts?.file_count  > 0 && (
                  <span className="proj-hero-chip">
                    <FolderOpen size={11} weight="duotone" />
                    {fileCounts.file_count} file{fileCounts.file_count !== 1 ? "s" : ""}
                  </span>
                )}
                {fileCounts?.media_count > 0 && (
                  <span className="proj-hero-chip">
                    <VideoCamera size={11} weight="duotone" />
                    {fileCounts.media_count} media
                  </span>
                )}
                {fileCounts?.member_count > 0 && (
                  <span className="proj-hero-chip">
                    <Users size={11} weight="duotone" />
                    {fileCounts.member_count} member{fileCounts.member_count !== 1 ? "s" : ""}
                  </span>
                )}
                {dueDate && (
                  <span className="proj-hero-chip">
                    <Clock size={11} weight="duotone" />
                    Due {dueDate}
                  </span>
                )}
              </div>
            </div>

            <div className="proj-hero-actions">
              {canManageSharing && (
                <button className="btn-ghost" onClick={() => navigate(`/projects/${id}/sharing`)}>
                  <ShareNetwork size={14} weight="duotone" /> Share
                </button>
              )}
              {canManageSettings && (
                <button className="btn-primary-sm" onClick={() => navigate(`/projects/${id}/team`)}>
                  <UserPlus size={14} weight="duotone" /> Invite
                </button>
              )}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="project-tabs">
          {TABS.map(tab => (
            <NavLink
              key={tab.path}
              to={`/projects/${id}/${tab.path}`}
              className={({ isActive }) => `project-tab ${isActive ? "active" : ""}`}
            >
              {tab.icon}
              {tab.label}
              {tab.count !== null && tab.count > 0 && (
                <span className="proj-tab-count">{tab.count}</span>
              )}
            </NavLink>
          ))}
        </div>

        {/* Content */}
        <div className="project-tab-content">
          <Routes>
            <Route index                         element={<Navigate to="files" replace />} />
            <Route path="files"                  element={<ProjectFilesPage />} />
            <Route path="files/folder/:folderId" element={<ProjectFilesPage />} />
            <Route path="media"                  element={<ProjectMediaPage />} />
            <Route path="manage"                 element={<ManageTab />} />
            <Route path="team"                   element={<ProjectTeamPage />} />
            <Route path="sharing"                element={<ProjectSharingPage />} />
            <Route path="settings"               element={<ProjectSettingsPage />} />
          </Routes>
        </div>
      </div>
    </DashboardLayout>
  );
}
