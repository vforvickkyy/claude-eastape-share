import React, { useState, useEffect, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import {
  HardDrive,
  Files,
  User,
  ArrowDown,
  MagnifyingGlass,
  Trash,
  Warning,
  Database,
} from "@phosphor-icons/react";
import AdminStatsCard from "../components/AdminStatsCard.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";

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

/* ── Format helpers ──────────────────────────────────────── */
function fmtBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const gb = bytes / (1024 * 1024 * 1024);
  const mb = bytes / (1024 * 1024);
  const kb = bytes / 1024;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  if (kb >= 1) return `${kb.toFixed(1)} KB`;
  return `${bytes} B`;
}

function fmtGB(bytes) {
  if (!bytes || bytes === 0) return "0.00 GB";
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/* Quota in bytes by plan name */
const PLAN_QUOTAS = {
  free:     5   * 1024 * 1024 * 1024,
  pro:      50  * 1024 * 1024 * 1024,
  business: 200 * 1024 * 1024 * 1024,
};
function quotaForPlan(planName) {
  return PLAN_QUOTAS[(planName || "").toLowerCase()] ?? PLAN_QUOTAS.free;
}

/* ── Usage bar ───────────────────────────────────────────── */
function UsageBar({ used, quota }) {
  const pct = quota > 0 ? Math.min((used / quota) * 100, 100) : 0;
  const color = pct > 90 ? "#f87171" : pct > 70 ? "#fbbf24" : "#4ade80";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <div
        style={{
          flex: 1,
          height: "6px",
          borderRadius: "999px",
          background: "rgba(255,255,255,0.06)",
          overflow: "hidden",
          minWidth: "80px",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: color,
            borderRadius: "999px",
            transition: "width 0.4s ease",
          }}
        />
      </div>
      <span style={{ fontSize: "11px", color: "var(--t3)", whiteSpace: "nowrap" }}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────── */
export default function AdminStorage() {
  /* Stats state */
  const [totalStorage, setTotalStorage] = useState(0);
  const [totalFiles,   setTotalFiles]   = useState(0);
  const [totalUsers,   setTotalUsers]   = useState(0);
  const [largestFile,  setLargestFile]  = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);

  /* Per-user storage */
  const [userRows,    setUserRows]    = useState([]);
  const [userLoading, setUserLoading] = useState(true);

  /* File browser */
  const [files,         setFiles]         = useState([]);
  const [fileLoading,   setFileLoading]   = useState(true);
  const [search,        setSearch]        = useState("");
  const [filePage,      setFilePage]      = useState(1);
  const [fileTotalCount, setFileTotalCount] = useState(0);
  const FILE_PAGE_SIZE = 50;

  /* Delete modal */
  const [deletingFile,  setDeletingFile]  = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  /* ── Load stats ─────────────────────────────────────────── */
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    const { headers } = getAuth();
    try {
      const [sharesRes, profilesRes] = await Promise.all([
        fetch(`${BASE}/rest/v1/shares?select=file_size`, { headers }),
        fetch(`${BASE}/rest/v1/profiles?select=id&limit=1`, {
          headers: { ...headers, Prefer: "count=exact" },
        }),
      ]);
      const sharesData = await sharesRes.json();
      const countHeader = profilesRes.headers.get("content-range");
      const usersCount = countHeader ? parseInt(countHeader.split("/")[1]) || 0 : 0;

      const sizes = Array.isArray(sharesData) ? sharesData.map((s) => Number(s.file_size) || 0) : [];
      const total   = sizes.reduce((acc, v) => acc + v, 0);
      const largest = sizes.length > 0 ? Math.max(...sizes) : 0;

      setTotalStorage(total);
      setTotalFiles(sizes.length);
      setTotalUsers(usersCount);
      setLargestFile(largest);
    } catch {
      // ignore
    } finally {
      setStatsLoading(false);
    }
  }, []);

  /* ── Load per-user storage ──────────────────────────────── */
  const loadUserStorage = useCallback(async () => {
    setUserLoading(true);
    const { headers } = getAuth();
    try {
      const [profilesRes, sharesRes, userPlansRes] = await Promise.all([
        fetch(`${BASE}/rest/v1/profiles?select=id,full_name,email&limit=100`, { headers }),
        fetch(`${BASE}/rest/v1/shares?select=user_id,file_size`, { headers }),
        fetch(`${BASE}/rest/v1/user_plans?select=user_id,plans(name)&is_active=eq.true`, { headers }),
      ]);
      const [profiles, allShares, userPlans] = await Promise.all([
        profilesRes.json(),
        sharesRes.json(),
        userPlansRes.json(),
      ]);

      /* Build plan name map */
      const planMap = {};
      if (Array.isArray(userPlans)) {
        userPlans.forEach((up) => { planMap[up.user_id] = up.plans?.name || "free"; });
      }

      /* Group shares by user_id */
      const grouped = {};
      if (Array.isArray(allShares)) {
        allShares.forEach((s) => {
          if (!grouped[s.user_id]) grouped[s.user_id] = { count: 0, total: 0 };
          grouped[s.user_id].count += 1;
          grouped[s.user_id].total += Number(s.file_size) || 0;
        });
      }

      /* Merge with profiles */
      const rows = (Array.isArray(profiles) ? profiles : []).map((p) => ({
        ...p,
        files:        grouped[p.id]?.count   || 0,
        storage_used: grouped[p.id]?.total   || 0,
        plan_name:    planMap[p.id] || "free",
      }));
      rows.sort((a, b) => b.storage_used - a.storage_used);
      setUserRows(rows);
    } catch {
      // ignore
    } finally {
      setUserLoading(false);
    }
  }, []);

  /* ── Load file browser ──────────────────────────────────── */
  const loadFiles = useCallback(async (searchQ = "", page = 1) => {
    setFileLoading(true);
    const { headers } = getAuth();
    const offset = (page - 1) * FILE_PAGE_SIZE;
    let url = `${BASE}/rest/v1/shares?select=id,filename,file_size,content_type,created_at,user_id,profiles(full_name,email)&order=created_at.desc&limit=${FILE_PAGE_SIZE}&offset=${offset}`;
    if (searchQ) url += `&filename=ilike.*${encodeURIComponent(searchQ)}*`;
    try {
      const res = await fetch(url, {
        headers: { ...headers, Prefer: "count=exact" },
      });
      const data = await res.json();
      const cr = res.headers.get("content-range");
      const total = cr ? parseInt(cr.split("/")[1]) || 0 : 0;
      setFiles(Array.isArray(data) ? data : []);
      setFileTotalCount(total);
    } catch {
      setFiles([]);
    } finally {
      setFileLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
    loadUserStorage();
    loadFiles("", 1);
  }, [loadStats, loadUserStorage, loadFiles]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilePage(1);
      loadFiles(search, 1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Delete file ─────────────────────────────────────────── */
  async function handleDeleteFile() {
    if (!deletingFile) return;
    setDeleteLoading(true);
    const { headers } = getAuth();
    try {
      await fetch(`${BASE}/functions/v1/admin-delete-file`, {
        method: "POST",
        headers,
        body: JSON.stringify({ fileId: deletingFile.id }),
      });
      await auditLog("file.deleted", "share", deletingFile.id, { filename: deletingFile.filename });
      setDeletingFile(null);
      loadFiles(search, filePage);
      loadStats();
      loadUserStorage();
    } catch {
      // ignore
    } finally {
      setDeleteLoading(false);
    }
  }

  /* ── Over-quota warnings ─────────────────────────────────── */
  const overQuotaUsers = userRows.filter((u) => u.storage_used > quotaForPlan(u.plan_name));

  const fileTotalPages = Math.max(1, Math.ceil(fileTotalCount / FILE_PAGE_SIZE));
  const avgPerUser = totalUsers > 0 ? totalStorage / totalUsers : 0;

  return (
    <div>
      <div className="admin-page-title">Storage</div>
      <div className="admin-page-sub">Monitor and manage file storage across all users.</div>

      {/* Overview stats */}
      <div className="admin-stats-grid">
        <AdminStatsCard
          icon={<HardDrive size={18} />}
          label="Total Storage"
          value={fmtGB(totalStorage)}
          loading={statsLoading}
          color="#f97316"
        />
        <AdminStatsCard
          icon={<Files size={18} />}
          label="Total Files"
          value={totalFiles.toLocaleString()}
          loading={statsLoading}
          color="#3b82f6"
        />
        <AdminStatsCard
          icon={<User size={18} />}
          label="Avg per User"
          value={fmtGB(avgPerUser)}
          loading={statsLoading}
          color="#a78bfa"
        />
        <AdminStatsCard
          icon={<ArrowDown size={18} />}
          label="Largest File"
          value={fmtBytes(largestFile)}
          loading={statsLoading}
          color="#fbbf24"
        />
      </div>

      {/* Per-user storage table */}
      <div className="admin-section" style={{ marginBottom: "20px" }}>
        <div className="admin-section-title">
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Database size={16} />
            Storage by User
          </span>
          <span style={{ fontSize: "12px", color: "var(--t3)", fontWeight: 400 }}>
            {userRows.length} users · sorted by usage
          </span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Plan</th>
                <th>Files</th>
                <th>Storage Used</th>
                <th style={{ minWidth: "160px" }}>Usage</th>
              </tr>
            </thead>
            <tbody>
              {userLoading ? (
                [0, 1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="admin-table-skeleton">
                    {[0, 1, 2, 3, 4, 5].map((j) => (
                      <td key={j}>
                        <span className="admin-table-skeleton-row" style={{ width: "70%" }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : userRows.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="admin-empty">No users found.</div>
                  </td>
                </tr>
              ) : (
                userRows.map((u) => {
                  const quota = quotaForPlan(u.plan_name);
                  const isOver = u.storage_used > quota;
                  return (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 500 }}>
                        {isOver && (
                          <Warning
                            size={13}
                            style={{ color: "#f87171", marginRight: "5px", verticalAlign: "middle" }}
                          />
                        )}
                        {u.full_name || "—"}
                      </td>
                      <td style={{ color: "var(--t3)" }}>{u.email || "—"}</td>
                      <td>
                        <span
                          style={{
                            fontSize: "11px",
                            padding: "2px 8px",
                            borderRadius: "999px",
                            background: "rgba(255,255,255,0.05)",
                            color: "var(--t2)",
                            textTransform: "capitalize",
                          }}
                        >
                          {u.plan_name}
                        </span>
                      </td>
                      <td>{u.files.toLocaleString()}</td>
                      <td style={{ color: isOver ? "#f87171" : "var(--t1)" }}>
                        {fmtBytes(u.storage_used)}
                      </td>
                      <td>
                        <UsageBar used={u.storage_used} quota={quota} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* File browser */}
      <div className="admin-section" style={{ marginBottom: "20px" }}>
        <div className="admin-section-title">
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Files size={16} />
            File Browser
          </span>
          <span style={{ fontSize: "12px", color: "var(--t3)", fontWeight: 400 }}>
            {fileTotalCount.toLocaleString()} files total
          </span>
        </div>

        {/* Search */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ position: "relative", maxWidth: "320px" }}>
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
              placeholder="Search filename…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Filename</th>
                <th>Owner</th>
                <th>Size</th>
                <th>Type</th>
                <th>Uploaded</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {fileLoading ? (
                [0, 1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="admin-table-skeleton">
                    {[0, 1, 2, 3, 4, 5].map((j) => (
                      <td key={j}>
                        <span className="admin-table-skeleton-row" style={{ width: "70%" }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : files.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="admin-empty">
                      {search ? `No files matching "${search}".` : "No files found."}
                    </div>
                  </td>
                </tr>
              ) : (
                files.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <span
                        style={{
                          fontWeight: 500,
                          maxWidth: "220px",
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={f.filename}
                      >
                        {f.filename || "—"}
                      </span>
                    </td>
                    <td>
                      <div style={{ lineHeight: 1.4 }}>
                        <div style={{ fontSize: "13px" }}>{f.profiles?.full_name || "—"}</div>
                        <div style={{ fontSize: "11px", color: "var(--t3)" }}>{f.profiles?.email || "—"}</div>
                      </div>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtBytes(f.file_size)}</td>
                    <td>
                      <span style={{ fontSize: "11px", color: "var(--t3)", fontFamily: "monospace" }}>
                        {f.content_type || "—"}
                      </span>
                    </td>
                    <td style={{ whiteSpace: "nowrap", color: "var(--t3)", fontSize: "12px" }}>
                      {f.created_at
                        ? new Date(f.created_at).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                    <td>
                      <button className="admin-action-btn danger" onClick={() => setDeletingFile(f)}>
                        <Trash size={13} /> Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {fileTotalPages > 1 && (
          <div className="admin-pagination">
            <span style={{ fontSize: "12px", color: "var(--t3)" }}>
              Page {filePage} of {fileTotalPages} · {fileTotalCount.toLocaleString()} files
            </span>
            <div style={{ display: "flex", gap: "4px" }}>
              <button
                className="admin-page-btn"
                onClick={() => setFilePage((p) => Math.max(1, p - 1))}
                disabled={filePage <= 1}
              >
                ‹
              </button>
              {Array.from({ length: Math.min(fileTotalPages, 7) }, (_, i) => {
                const p = filePage <= 4 ? i + 1 : filePage - 3 + i;
                if (p < 1 || p > fileTotalPages) return null;
                return (
                  <button
                    key={p}
                    className={`admin-page-btn${p === filePage ? " active" : ""}`}
                    onClick={() => setFilePage(p)}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                className="admin-page-btn"
                onClick={() => setFilePage((p) => Math.min(fileTotalPages, p + 1))}
                disabled={filePage >= fileTotalPages}
              >
                ›
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Storage health */}
      {overQuotaUsers.length > 0 && (
        <div className="admin-section">
          <div className="admin-section-title" style={{ color: "#f87171" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Warning size={16} weight="fill" style={{ color: "#f87171" }} />
              Storage Health — Over Quota ({overQuotaUsers.length})
            </span>
          </div>
          <div className="admin-section-body" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {overQuotaUsers.map((u) => {
              const quota = quotaForPlan(u.plan_name);
              const pct = Math.round((u.storage_used / quota) * 100);
              return (
                <div
                  key={u.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                    padding: "12px 16px",
                    borderRadius: "8px",
                    background: "rgba(248,113,113,0.06)",
                    border: "1px solid rgba(248,113,113,0.2)",
                  }}
                >
                  <Warning size={16} weight="fill" style={{ color: "#f87171", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: "13px" }}>{u.full_name || u.email || "Unknown"}</div>
                    <div style={{ fontSize: "12px", color: "var(--t3)" }}>{u.email}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: "13px", color: "#f87171", fontWeight: 600 }}>
                      {fmtBytes(u.storage_used)} / {fmtBytes(quota)}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--t3)" }}>
                      {pct}% used · {u.plan_name}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      <AnimatePresence>
        {deletingFile && (
          <ConfirmModal
            key="delete-file"
            title="Delete File"
            message={`Delete "${deletingFile.filename}"? This cannot be undone.`}
            confirmLabel="Delete File"
            onConfirm={handleDeleteFile}
            onClose={() => setDeletingFile(null)}
            loading={deleteLoading}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
