import React, { useEffect } from "react";
import { useNavigate, useParams, useLocation, Routes, Route, NavLink, Navigate } from "react-router-dom";
import {
  FolderOpen, Users, ShareNetwork, Gear, ArrowLeft,
} from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";
import { useProject } from "./context/ProjectContext";
import DashboardLayout from "./DashboardLayout";
import ProjectFilesPage    from "./ProjectFilesPage";
import ProjectTeamPage     from "./ProjectTeamPage";
import ProjectSharingPage  from "./ProjectSharingPage";
import ProjectSettingsPage from "./ProjectSettingsPage";

const TABS = [
  { path: "files",    label: "Files",    icon: <FolderOpen   size={15} weight="duotone" /> },
  { path: "team",     label: "Team",     icon: <Users        size={15} weight="duotone" /> },
  { path: "sharing",  label: "Sharing",  icon: <ShareNetwork size={15} weight="duotone" /> },
  { path: "settings", label: "Settings", icon: <Gear         size={15} weight="duotone" /> },
];

export default function ProjectPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const { project, loading: projLoading } = useProject();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login", { replace: true });
  }, [user, authLoading]);

  const currentTab = TABS.find(t => location.pathname.includes(`/${t.path}`))?.path || "files";

  const projectTitle = projLoading ? "Loading…" : project?.name || "Project";

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

        {/* Project header */}
        {project && (
          <div className="project-header" style={{ borderLeftColor: project.color || "#6366f1" }}>
            <div className="project-header-color-bar" style={{ background: project.color || "#6366f1" }} />
            <div className="project-header-info">
              <h2 className="project-header-name">{project.name}</h2>
              {project.client_name && (
                <div className="project-header-client">Client: {project.client_name}</div>
              )}
            </div>
          </div>
        )}

        {/* Tab nav */}
        <div className="project-tabs">
          {TABS.map(tab => (
            <NavLink
              key={tab.path}
              to={`/projects/${id}/${tab.path}`}
              className={({ isActive }) => `project-tab ${isActive ? "active" : ""}`}
            >
              {tab.icon}
              {tab.label}
            </NavLink>
          ))}
        </div>

        {/* Tab content */}
        <div className="project-tab-content">
          <Routes>
            <Route index                        element={<Navigate to="files" replace />} />
            <Route path="files"                 element={<ProjectFilesPage />} />
            <Route path="files/folder/:folderId" element={<ProjectFilesPage />} />
            <Route path="team"                  element={<ProjectTeamPage />} />
            <Route path="sharing"               element={<ProjectSharingPage />} />
            <Route path="settings"              element={<ProjectSettingsPage />} />
          </Routes>
        </div>
      </div>
    </DashboardLayout>
  );
}
