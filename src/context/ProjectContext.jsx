import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useParams, useLocation } from "react-router-dom";

const ProjectContext = createContext(null);
const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

function getToken() {
  try { return JSON.parse(localStorage.getItem("ets_auth"))?.access_token; } catch { return null; }
}

const CAN_EDIT   = new Set(['owner', 'admin', 'editor'])
const CAN_DELETE = new Set(['owner', 'admin'])
const CAN_MANAGE = new Set(['owner', 'admin'])

export function ProjectProvider({ children }) {
  const { id } = useParams();
  const location = useLocation();
  const [project,    setProject]    = useState(null);
  const [fileCounts, setFileCounts] = useState({ file_count: 0, media_count: 0, member_count: 0 });
  const [loading,    setLoading]    = useState(false);
  const [userRole,   setUserRole]   = useState(null);

  const fetchProject = useCallback(async (projectId) => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/projects?id=${projectId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.project) {
        setProject(data.project);
        setFileCounts({ file_count: data.file_count, media_count: data.media_count, member_count: data.member_count });
        const session = JSON.parse(localStorage.getItem("ets_auth") || "{}");
        const userId  = session?.user?.id;
        if (userId === data.project.user_id) {
          setUserRole("owner");
        } else {
          // Fetch member role from project_members
          try {
            const r2 = await fetch(`${BASE}/project-members?projectId=${projectId}`, {
              headers: { Authorization: `Bearer ${getToken()}` },
            });
            const d2 = await r2.json();
            const my = (d2.members || []).find(m => m.user_id === userId);
            setUserRole(my?.role || null);
          } catch {
            setUserRole(null);
          }
        }
      }
    } catch {
      setProject(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (id) {
      fetchProject(id);
    } else {
      setProject(null);
      setUserRole(null);
    }
  }, [id, fetchProject]);

  const isOwner          = userRole === "owner";
  const canEdit          = CAN_EDIT.has(userRole);
  const canDelete        = CAN_DELETE.has(userRole);
  const canManageMembers  = CAN_MANAGE.has(userRole);
  const canManageSettings = CAN_MANAGE.has(userRole);
  const canManageSharing  = CAN_MANAGE.has(userRole);
  const canDownload       = CAN_EDIT.has(userRole);
  const canComment        = userRole !== null && userRole !== 'viewer';

  return (
    <ProjectContext.Provider value={{
      project, isOwner, userRole, loading, fileCounts,
      canEdit, canDelete, canManageMembers, canManageSettings, canManageSharing,
      canDownload, canComment,
      refetch: () => fetchProject(id),
    }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  return useContext(ProjectContext);
}
