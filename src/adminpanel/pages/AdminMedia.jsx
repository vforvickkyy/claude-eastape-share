import React, { useState, useEffect, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import {
  VideoCamera,
  Play,
  Warning,
  Trash,
  MagnifyingGlass,
  X,
  Folder,
  Clock,
  CheckCircle,
} from "@phosphor-icons/react";
import AdminStatsCard from "../components/AdminStatsCard.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import AdminModal from "../components/AdminModal.jsx";

/* ── Auth helpers ─────────────────────────────────────────── */
function getAuth() {
  const session = JSON.parse(localStorage.getItem("ets_auth") || "{}");
  return {
    token: session.access_token,
    userId: session.user?.id,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
  };
}
const BASE = import.meta.env.VITE_SUPABASE_URL;

async function auditLog(action, targetType, targetId, metadata = {}) {
  const { userId, headers } = getAuth();
  await fetch(`${BASE}/rest/v1/admin_audit_logs`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      admin_id: userId,
      action,
      target_type: targetType,
      target_id: String(targetId),
      metadata,
    }),
  });
}

/* ── Helpers ─────────────────────────────────────────────── */
function fmtDuration(seconds) {
  if (!seconds && seconds !== 0) return "—";
  const s = Math.floor(Number(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const STATUS_STYLES = {
  ready:      { bg: "rgba(74,222,128,0.12)",  color: "#4ade80",  label: "Ready"      },
  processing: { bg: "rgba(251,191,36,0.12)",  color: "#fbbf24",  label: "Processing" },
  error:      { bg: "rgba(248,113,113,0.12)", color: "#f87171",  label: "Error"      },
};
function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || { bg: "rgba(255,255,255,0.06)", color: "var(--t3)", label: status || "Unknown" };
  return (
    <span
      style={{
        fontSize: "11px",
        padding: "3px 9px",
        borderRadius: "999px",
        background: s.bg,
        color: s.color,
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: s.color,
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      {s.label}
    </span>
  );
}

/* ── Filter tab component ────────────────────────────────── */
const FILTER_TABS = [
  { key: "all",        label: "All"        },
  { key: "ready",      label: "Ready"      },
  { key: "processing", label: "Processing" },
  { key: "error",      label: "Error"      },
];

/* ── Video Player Modal ──────────────────────────────────── */
function VideoPlayerModal({ asset, onClose }) {
  return (
    <AdminModal title={asset.name || "Video Preview"} onClose={onClose} maxWidth="760px">
      <div>
        {asset.bunny_playback_url ? (
          <iframe
            src={`${asset.bunny_playback_url}?autoplay=false`}
            width="100%"
            height="400"
            style={{ border: "none", borderRadius: "8px", display: "block" }}
            allowFullScreen
            title={asset.name || "Video"}
          />
        ) : (
          <div
            style={{
              height: "200px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--t3)",
              fontSize: "14px",
              background: "var(--bg)",
              borderRadius: "8px",
              gap: "8px",
            }}
          >
            <VideoCamera size={24} />
            No playback URL available
          </div>
        )}
        <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "6px" }}>
          {[
            ["Project",  asset.media_projects?.name  || "—"],
            ["Owner",    asset.profiles?.email        || "—"],
            ["Duration", fmtDuration(asset.duration)        ],
            ["Status",   asset.bunny_video_status     || "—"],
            ["GUID",     asset.bunny_video_guid       || "—"],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", gap: "12px", fontSize: "12px" }}>
              <span style={{ color: "var(--t3)", width: "70px", flexShrink: 0 }}>{k}</span>
              <span style={{ color: "var(--t2)", fontFamily: k === "GUID" ? "monospace" : "inherit" }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </AdminModal>
  );
}

/* ── Thumbnail cell ──────────────────────────────────────── */
function Thumb({ asset }) {
  if (asset.bunny_thumbnail_url) {
    return (
      <img
        src={asset.bunny_thumbnail_url}
        alt={asset.name}
        style={{
          width: "64px",
          height: "40px",
          objectFit: "cover",
          borderRadius: "6px",
          display: "block",
          background: "#000",
        }}
        onError={(e) => { e.target.style.display = "none"; }}
      />
    );
  }
  return (
    <div
      style={{
        width: "64px",
        height: "40px",
        background: "rgba(255,255,255,0.04)",
        borderRadius: "6px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--t3)",
      }}
    >
      <VideoCamera size={18} />
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────── */
const PAGE_SIZE = 20;

export default function AdminMedia() {
  /* Stats */
  const [counts,       setCounts]       = useState({ total: 0, ready: 0, processing: 0, error: 0 });
  const [statsLoading, setStatsLoading] = useState(true);

  /* Videos table */
  const [videos,       setVideos]       = useState([]);
  const [videoLoading, setVideoLoading] = useState(true);
  const [page,         setPage]         = useState(1);
  const [totalCount,   setTotalCount]   = useState(0);
  const [filter,       setFilter]       = useState("all");
  const [search,       setSearch]       = useState("");

  /* Failed uploads */
  const [failedVideos, setFailedVideos] = useState([]);

  /* Projects */
  const [projects,        setProjects]        = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);

  /* Modals */
  const [previewAsset,  setPreviewAsset]  = useState(null);
  const [deletingAsset, setDeletingAsset] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  /* ── Load stats ─────────────────────────────────────────── */
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    const { headers } = getAuth();
    try {
      const [totalRes, readyRes, processingRes, errorRes] = await Promise.all([
        fetch(`${BASE}/rest/v1/media_assets?select=count`, {
          headers: { ...headers, Prefer: "count=exact" },
        }),
        fetch(`${BASE}/rest/v1/media_assets?bunny_video_status=eq.ready&select=count`, {
          headers: { ...headers, Prefer: "count=exact" },
        }),
        fetch(`${BASE}/rest/v1/media_assets?bunny_video_status=eq.processing&select=count`, {
          headers: { ...headers, Prefer: "count=exact" },
        }),
        fetch(`${BASE}/rest/v1/media_assets?bunny_video_status=eq.error&select=count`, {
          headers: { ...headers, Prefer: "count=exact" },
        }),
      ]);
      function getCount(res) {
        const cr = res.headers.get("content-range");
        return cr ? parseInt(cr.split("/")[1]) || 0 : 0;
      }
      setCounts({
        total:      getCount(totalRes),
        ready:      getCount(readyRes),
        processing: getCount(processingRes),
        error:      getCount(errorRes),
      });
    } catch {
      // ignore
    } finally {
      setStatsLoading(false);
    }
  }, []);

  /* ── Load videos ─────────────────────────────────────────── */
  const loadVideos = useCallback(async (f = "all", q = "", pg = 1) => {
    setVideoLoading(true);
    const { headers } = getAuth();
    const offset = (pg - 1) * PAGE_SIZE;
    let url =
      `${BASE}/rest/v1/media_assets?select=id,name,bunny_video_status,bunny_video_guid,bunny_thumbnail_url,bunny_playback_url,duration,created_at,user_id,project_id,profiles(full_name,email),media_projects(name)` +
      `&order=created_at.desc&limit=${PAGE_SIZE}&offset=${offset}`;
    if (f !== "all") url += `&bunny_video_status=eq.${f}`;
    if (q)           url += `&name=ilike.*${encodeURIComponent(q)}*`;
    try {
      const res = await fetch(url, {
        headers: {
          ...headers,
          Prefer: "count=exact",
          Range: `${offset}-${offset + PAGE_SIZE - 1}`,
        },
      });
      const data = await res.json();
      const cr = res.headers.get("content-range");
      const total = cr ? parseInt(cr.split("/")[1]) || 0 : 0;
      setVideos(Array.isArray(data) ? data : []);
      setTotalCount(total);
    } catch {
      setVideos([]);
    } finally {
      setVideoLoading(false);
    }
  }, []);

  /* ── Load failed uploads ─────────────────────────────────── */
  const loadFailed = useCallback(async () => {
    const { headers } = getAuth();
    try {
      const res = await fetch(
        `${BASE}/rest/v1/media_assets?select=id,name,created_at,user_id,profiles(full_name,email)&bunny_video_status=eq.error&order=created_at.desc&limit=20`,
        { headers }
      );
      const data = await res.json();
      setFailedVideos(Array.isArray(data) ? data : []);
    } catch {
      setFailedVideos([]);
    }
  }, []);

  /* ── Load projects ───────────────────────────────────────── */
  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    const { headers } = getAuth();
    try {
      const res = await fetch(
        `${BASE}/rest/v1/media_projects?select=id,name,user_id,created_at,profiles(full_name,email)&order=created_at.desc&limit=10`,
        { headers }
      );
      const data = await res.json();
      setProjects(Array.isArray(data) ? data : []);
    } catch {
      setProjects([]);
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
    loadFailed();
    loadProjects();
  }, [loadStats, loadFailed, loadProjects]);

  useEffect(() => {
    loadVideos(filter, search, page);
  }, [filter, page]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      loadVideos(filter, search, 1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleFilterChange(newFilter) {
    setFilter(newFilter);
    setPage(1);
  }

  /* ── Delete video ────────────────────────────────────────── */
  async function handleDeleteVideo() {
    if (!deletingAsset) return;
    setDeleteLoading(true);
    const { headers } = getAuth();
    try {
      await fetch(`${BASE}/functions/v1/admin-delete-video`, {
        method: "POST",
        headers,
        body: JSON.stringify({ assetId: deletingAsset.id }),
      });
      await auditLog("video.deleted", "media_asset", deletingAsset.id, { name: deletingAsset.name });
      setDeletingAsset(null);
      loadVideos(filter, search, page);
      loadStats();
      loadFailed();
    } catch {
      // ignore
    } finally {
      setDeleteLoading(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div>
      <div className="admin-page-title">Media</div>
      <div className="admin-page-sub">Manage media projects and video assets.</div>

      {/* Overview stats */}
      <div className="admin-stats-grid">
        <AdminStatsCard
          icon={<VideoCamera size={18} />}
          label="Total Videos"
          value={counts.total.toLocaleString()}
          loading={statsLoading}
          color="#f97316"
        />
        <AdminStatsCard
          icon={<CheckCircle size={18} />}
          label="Ready"
          value={counts.ready.toLocaleString()}
          loading={statsLoading}
          color="#4ade80"
        />
        <AdminStatsCard
          icon={<Clock size={18} />}
          label="Processing"
          value={counts.processing.toLocaleString()}
          loading={statsLoading}
          color="#fbbf24"
        />
        <AdminStatsCard
          icon={<Warning size={18} />}
          label="Error"
          value={counts.error.toLocaleString()}
          loading={statsLoading}
          color="#f87171"
        />
      </div>

      {/* Videos table */}
      <div className="admin-section" style={{ marginBottom: "20px" }}>
        <div className="admin-section-title">
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <VideoCamera size={16} />
            Videos
          </span>
          <span style={{ fontSize: "12px", color: "var(--t3)", fontWeight: 400 }}>
            {totalCount.toLocaleString()} total
          </span>
        </div>

        {/* Filter tabs + search */}
        <div
          style={{
            padding: "12px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          {/* Tabs */}
          <div style={{ display: "flex", gap: "4px" }}>
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleFilterChange(tab.key)}
                style={{
                  padding: "5px 12px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: filter === tab.key ? 600 : 400,
                  border: `1px solid ${filter === tab.key ? "var(--admin-accent)" : "var(--border)"}`,
                  background: filter === tab.key ? "rgba(249,115,22,0.1)" : "var(--card)",
                  color: filter === tab.key ? "#f97316" : "var(--t2)",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div style={{ position: "relative", flex: 1, maxWidth: "280px" }}>
            <MagnifyingGlass
              size={14}
              style={{
                position: "absolute",
                left: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--t3)",
                pointerEvents: "none",
              }}
            />
            <input
              className="admin-table-search"
              style={{ paddingLeft: "30px", width: "100%" }}
              placeholder="Search by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: "72px" }}>Thumb</th>
                <th>Title / Project</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Uploaded</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {videoLoading ? (
                [0, 1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="admin-table-skeleton">
                    {[0, 1, 2, 3, 4, 5, 6].map((j) => (
                      <td key={j}>
                        <span className="admin-table-skeleton-row" style={{ width: "70%" }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : videos.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="admin-empty">
                      {search
                        ? `No videos matching "${search}".`
                        : filter !== "all"
                        ? `No ${filter} videos.`
                        : "No videos found."}
                    </div>
                  </td>
                </tr>
              ) : (
                videos.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <Thumb asset={v} />
                    </td>
                    <td>
                      <div style={{ lineHeight: 1.4 }}>
                        <div
                          style={{
                            fontWeight: 500,
                            maxWidth: "200px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={v.name}
                        >
                          {v.name || "Untitled"}
                        </div>
                        {v.media_projects?.name && (
                          <div style={{ fontSize: "11px", color: "var(--t3)", display: "flex", alignItems: "center", gap: "4px" }}>
                            <Folder size={11} />
                            {v.media_projects.name}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ color: "var(--t3)", fontSize: "12px" }}>
                      {v.profiles?.email || "—"}
                    </td>
                    <td>
                      <StatusBadge status={v.bunny_video_status} />
                    </td>
                    <td style={{ color: "var(--t2)", fontSize: "12px", whiteSpace: "nowrap" }}>
                      {fmtDuration(v.duration)}
                    </td>
                    <td style={{ color: "var(--t3)", fontSize: "12px", whiteSpace: "nowrap" }}>
                      {fmtDate(v.created_at)}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          className="admin-action-btn"
                          onClick={() => setPreviewAsset(v)}
                          title="Preview"
                        >
                          <Play size={13} /> Preview
                        </button>
                        <button
                          className="admin-action-btn danger"
                          onClick={() => setDeletingAsset(v)}
                          title="Delete"
                        >
                          <Trash size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="admin-pagination">
            <span>
              Page {page} of {totalPages} · {totalCount.toLocaleString()} videos
            </span>
            <div style={{ display: "flex", gap: "4px" }}>
              <button
                className="admin-page-btn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                ‹
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const p = page <= 4 ? i + 1 : page - 3 + i;
                if (p < 1 || p > totalPages) return null;
                return (
                  <button
                    key={p}
                    className={`admin-page-btn${p === page ? " active" : ""}`}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                className="admin-page-btn"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                ›
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Failed uploads section */}
      {failedVideos.length > 0 && (
        <div className="admin-section" style={{ marginBottom: "20px" }}>
          <div className="admin-section-title" style={{ color: "#f87171" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Warning size={16} weight="fill" style={{ color: "#f87171" }} />
              Failed Uploads ({failedVideos.length})
            </span>
          </div>
          <div className="admin-section-body" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {failedVideos.map((v) => (
              <div
                key={v.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  background: "rgba(248,113,113,0.06)",
                  border: "1px solid rgba(248,113,113,0.2)",
                }}
              >
                <Warning size={16} weight="fill" style={{ color: "#f87171", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 500,
                      fontSize: "13px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {v.name || "Untitled"}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--t3)" }}>
                    {v.profiles?.full_name || v.profiles?.email || "Unknown"} · {fmtDate(v.created_at)}
                  </div>
                </div>
                <button
                  className="admin-action-btn danger"
                  onClick={() => setDeletingAsset(v)}
                >
                  <Trash size={13} /> Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Projects overview */}
      <div className="admin-section">
        <div className="admin-section-title">
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Folder size={16} />
            Recent Media Projects
          </span>
          <span style={{ fontSize: "12px", color: "var(--t3)", fontWeight: 400 }}>
            Latest 10
          </span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Project Name</th>
                <th>Owner</th>
                <th>Email</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {projectsLoading ? (
                [0, 1, 2, 3].map((i) => (
                  <tr key={i} className="admin-table-skeleton">
                    {[0, 1, 2, 3].map((j) => (
                      <td key={j}>
                        <span className="admin-table-skeleton-row" style={{ width: "70%" }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : projects.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <div className="admin-empty">No media projects found.</div>
                  </td>
                </tr>
              ) : (
                projects.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 500 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Folder size={14} style={{ color: "var(--t3)" }} />
                        {p.name || "Untitled"}
                      </span>
                    </td>
                    <td>{p.profiles?.full_name || "—"}</td>
                    <td style={{ color: "var(--t3)", fontSize: "12px" }}>{p.profiles?.email || "—"}</td>
                    <td style={{ color: "var(--t3)", fontSize: "12px" }}>{fmtDate(p.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {previewAsset && (
          <VideoPlayerModal
            key="video-preview"
            asset={previewAsset}
            onClose={() => setPreviewAsset(null)}
          />
        )}
        {deletingAsset && (
          <ConfirmModal
            key="delete-video"
            title="Delete Video"
            message={`Delete "${deletingAsset.name || "this video"}"? This will permanently remove it from Bunny Stream and cannot be undone.`}
            confirmLabel="Delete Video"
            onConfirm={handleDeleteVideo}
            onClose={() => setDeletingAsset(null)}
            loading={deleteLoading}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
