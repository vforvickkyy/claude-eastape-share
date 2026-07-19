import React, { useEffect, useState } from "react";
import { Play, CalendarBlank, User, FilmSlate } from "@phosphor-icons/react";
import { shareLinksApi } from "../../lib/api";

function StatusPill({ status }) {
  if (!status) return <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>—</span>;
  const c = status.color || "#6366f1";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 9px", borderRadius: 20,
      fontSize: 11, fontWeight: 600, background: c + "22", border: `1px solid ${c}55`, color: c,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c, flexShrink: 0 }} />
      {status.name}
    </span>
  );
}

function Assignee({ shot, teamMembers }) {
  if (shot.assigned_to_name) {
    return (
      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
        {shot.assigned_to_avatar
          ? <img src={shot.assigned_to_avatar} alt="" style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover" }} />
          : <User size={14} style={{ color: "rgba(255,255,255,0.35)" }} />}
        {shot.assigned_to_name}
      </span>
    );
  }
  if (shot.custom_assignee) {
    return <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{shot.custom_assignee}</span>;
  }
  return <span style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>—</span>;
}

function CustomCellValue({ shot, col, teamMembers }) {
  const val = shot.custom_data?.[col.name];
  if (val == null || val === "") return <span style={{ color: "rgba(255,255,255,0.25)" }}>—</span>;

  if (col.type === "checkbox") {
    return (
      <span style={{ display: "inline-flex", width: 16, height: 16, borderRadius: 4, background: val ? "#6366f1" : "transparent", border: `1.5px solid ${val ? "#6366f1" : "rgba(255,255,255,0.25)"}` }} />
    );
  }
  if (col.type === "date") {
    return <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>{new Date(val).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" })}</span>;
  }
  if (col.type === "select") {
    const vals = Array.isArray(val) ? val : [val];
    return (
      <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {vals.map(v => (
          <span key={v} style={{ fontSize: 11, padding: "1px 8px", borderRadius: 20, background: "rgba(124,58,237,0.15)", color: "#a78bfa", border: "1px solid rgba(124,58,237,0.3)" }}>{v}</span>
        ))}
      </span>
    );
  }
  if (col.type === "team") {
    const member = teamMembers.find(m => m.id === val || m.user_id === val);
    const name = member?.full_name || member?.display_name || "Unknown";
    return <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>{name}</span>;
  }
  return <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>{String(val)}</span>;
}

export default function PublicManageBoard({ token, password }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    shareLinksApi.resolveManage(token, password)
      .then(d => { if (!cancelled) setData(d); })
      .catch(err => { if (!cancelled) setError(err.message || "Failed to load"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, password]);

  if (loading) {
    return <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><span className="spinner" style={{ width: 28, height: 28 }} /></div>;
  }
  if (error || !data) {
    return <p style={{ textAlign: "center", color: "rgba(255,255,255,0.35)", fontSize: 13, padding: "40px 0" }}>{error || "This project has no production board yet."}</p>;
  }

  const { scenes = [], columns = [], shots = [], teamMembers = [] } = data;
  const sceneMap = new Map(scenes.map(s => [s.id, s]));
  const grouped = new Map(); // sceneId|"none" -> shots[]
  for (const shot of shots) {
    const key = shot.scene_id || "none";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(shot);
  }
  const orderedSceneIds = [...scenes.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map(s => s.id)];
  if (grouped.has("none")) orderedSceneIds.push("none");

  if (shots.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "48px 16px", color: "rgba(255,255,255,0.3)" }}>
        <FilmSlate size={40} weight="duotone" />
        <p style={{ fontSize: 13, margin: 0 }}>No shots have been added to this production board yet.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 20px 24px" }}>
      {orderedSceneIds.map(sceneId => {
        const sceneShots = grouped.get(sceneId) || [];
        if (sceneShots.length === 0) return null;
        const scene = sceneMap.get(sceneId);
        return (
          <div key={sceneId} style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 8px" }}>
              {scene ? scene.name : "No Scene"} <span style={{ fontWeight: 400, opacity: 0.6 }}>· {sceneShots.length} shot{sceneShots.length !== 1 ? "s" : ""}</span>
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    <th style={{ textAlign: "left", padding: "6px 8px", color: "rgba(255,255,255,0.35)", fontWeight: 600, width: 56 }}></th>
                    <th style={{ textAlign: "left", padding: "6px 8px", color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>Shot</th>
                    <th style={{ textAlign: "left", padding: "6px 8px", color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>Status</th>
                    <th style={{ textAlign: "left", padding: "6px 8px", color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>Assignee</th>
                    <th style={{ textAlign: "left", padding: "6px 8px", color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>Due</th>
                    {columns.map(col => (
                      <th key={col.id} style={{ textAlign: "left", padding: "6px 8px", color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>{col.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sceneShots.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map(shot => (
                    <tr key={shot.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "8px 8px" }}>
                        <div style={{ width: 44, height: 30, borderRadius: 5, overflow: "hidden", background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                          {shot.linked_cloudflare_uid ? (
                            <img
                              src={`https://videodelivery.net/${shot.linked_cloudflare_uid}/thumbnails/thumbnail.jpg?time=0s&width=200`}
                              alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              onError={e => { e.target.style.display = "none"; }}
                            />
                          ) : <Play size={12} style={{ color: "rgba(255,255,255,0.2)" }} />}
                        </div>
                      </td>
                      <td style={{ padding: "8px 8px" }}>
                        <div style={{ fontWeight: 600, color: "#fff" }}>{shot.shot_number ? `${shot.shot_number} · ` : ""}{shot.title}</div>
                      </td>
                      <td style={{ padding: "8px 8px" }}><StatusPill status={shot.production_statuses} /></td>
                      <td style={{ padding: "8px 8px" }}><Assignee shot={shot} teamMembers={teamMembers} /></td>
                      <td style={{ padding: "8px 8px" }}>
                        {shot.due_date ? (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
                            <CalendarBlank size={12} /> {new Date(shot.due_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </span>
                        ) : <span style={{ color: "rgba(255,255,255,0.25)" }}>—</span>}
                      </td>
                      {columns.map(col => (
                        <td key={col.id} style={{ padding: "8px 8px" }}>
                          <CustomCellValue shot={shot} col={col} teamMembers={teamMembers} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
