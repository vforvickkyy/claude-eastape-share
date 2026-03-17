import { createContext, useContext, useEffect, useState, useCallback } from "react";

const PlanContext = createContext(null);

const FREE_DEFAULTS = {
  plan: null,
  plan_name: "free",
  display_name: "Starter",
  storage_limit_gb: 2,
  max_files: null,
  max_videos: 5,
  max_team_members: 1,
  drive_enabled: true,
  media_enabled: true,
  sharing_enabled: true,
  features: [],
  // storage usage
  drive_bytes: 0,
  media_bytes: 0,
  used_bytes: 0,
  limit_bytes: 2 * 1024 * 1024 * 1024,
  percent_used: 0,
};

function getToken() {
  try {
    const s = JSON.parse(localStorage.getItem("ets_auth") || "{}");
    return s.access_token || null;
  } catch { return null; }
}

export function PlanProvider({ children }) {
  const [planData, setPlanData]   = useState(FREE_DEFAULTS);
  const [loading,  setLoading]    = useState(true);

  const fetchAll = useCallback(async () => {
    const token = getToken();
    if (!token) { setPlanData(FREE_DEFAULTS); setLoading(false); return; }

    const base = import.meta.env.VITE_SUPABASE_URL;
    const hdrs  = { Authorization: `Bearer ${token}` };

    try {
      const [planRes, storageRes] = await Promise.all([
        fetch(`${base}/functions/v1/user-plan`,    { headers: hdrs }),
        fetch(`${base}/functions/v1/user-storage`, { headers: hdrs }),
      ]);

      const plan    = planRes.ok    ? await planRes.json()    : {};
      const storage = storageRes.ok ? await storageRes.json() : {};

      setPlanData({
        plan:              plan.plan             ?? null,
        plan_name:         plan.plan_name        ?? "free",
        display_name:      plan.plan_name === "free" ? "Starter" : (storage.display_name ?? plan.plan_name ?? "Starter"),
        storage_limit_gb:  plan.storage_limit_gb ?? 2,
        max_files:         plan.max_files        ?? null,
        max_videos:        plan.max_videos       ?? 5,
        max_team_members:  plan.max_team_members ?? 1,
        drive_enabled:     plan.drive_enabled    ?? true,
        media_enabled:     plan.media_enabled    ?? true,
        sharing_enabled:   plan.sharing_enabled  ?? true,
        features:          plan.features         ?? [],
        // storage
        drive_bytes:   storage.drive_bytes   ?? 0,
        media_bytes:   storage.media_bytes   ?? 0,
        used_bytes:    storage.used_bytes    ?? 0,
        limit_bytes:   storage.limit_bytes   ?? (2 * 1024 * 1024 * 1024),
        percent_used:  storage.percent_used  ?? 0,
      });
    } catch {
      setPlanData(FREE_DEFAULTS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return (
    <PlanContext.Provider value={{ ...planData, loading, refetch: fetchAll }}>
      {children}
    </PlanContext.Provider>
  );
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("usePlan must be used within PlanProvider");
  return ctx;
}
