import { createContext, useContext, useEffect, useState, useCallback } from "react";

const PlanContext = createContext(null);

const FREE_DEFAULTS = {
  plan: null,
  plan_name: "Free",
  storage_limit_gb: 5,
  max_files: 100,
  max_videos: 5,
  max_team_members: 1,
  drive_enabled: true,
  media_enabled: false,
  sharing_enabled: true,
  features: ["Drive", "Basic Sharing", "5GB Storage"],
};

function getToken() {
  try {
    const s = JSON.parse(localStorage.getItem("ets_auth") || "{}");
    return s.access_token || null;
  } catch {
    return null;
  }
}

export function PlanProvider({ children }) {
  const [planData, setPlanData] = useState(FREE_DEFAULTS);
  const [loading, setLoading] = useState(true);

  const fetchPlan = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setPlanData(FREE_DEFAULTS);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/user-plan`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setPlanData(data);
      } else {
        setPlanData(FREE_DEFAULTS);
      }
    } catch {
      setPlanData(FREE_DEFAULTS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  return (
    <PlanContext.Provider value={{ ...planData, loading, refetch: fetchPlan }}>
      {children}
    </PlanContext.Provider>
  );
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("usePlan must be used within PlanProvider");
  return ctx;
}
