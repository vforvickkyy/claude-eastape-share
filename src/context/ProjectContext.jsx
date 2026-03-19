import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useParams, useLocation } from "react-router-dom";

const ProjectContext = createContext(null);
const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

function getToken() {
  try { return JSON.parse(localStorage.getItem("ets_auth"))?.access_token; } catch { return null; }
}

export function ProjectProvider({ children }) {
  const { id } = useParams();
  const location = useLocation();
  const [project, setProject] = useState(null);
  const [fileCounts, setFileCounts] = useState({ file_count: 0, media_count: 0, member_count: 0 });
  const [loading, setLoading] = useState(false);
  const [userRole, setUserRole] = useState(null);

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
        // Determine user role from localStorage
        const session = JSON.parse(localStorage.getItem("ets_auth") || "{}");
        const userId = session?.user?.id;
        if (userId === data.project.user_id) setUserRole("owner");
        else setUserRole(null); // will be resolved by members fetch if needed
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

  const isOnProjectRoute = location.pathname.startsWith("/projects/") && id;
  const isOwner = userRole === "owner";

  return (
    <ProjectContext.Provider value={{ project, isOwner, userRole, loading, fileCounts, refetch: () => fetchProject(id) }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  return useContext(ProjectContext);
}
