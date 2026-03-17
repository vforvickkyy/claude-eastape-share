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
  const s = JSON.parse(localStorage.getItem("ets_auth") || "{}");
  return { token: s.access_token, userId: s.user?.id };
}

async function apiFetch(path, opts = {}) {
  const { token } = getAuth();
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1${path}`,
    {
      ...opts,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

/* ── Format helpers ──────────────────────────────────────── */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024)
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + " GB";
}

/* ── Avatar initials ─────────────────────────────────────── */
function Avatar({ name, size = 28 }) {
  const initial = (name || "?").charAt(0).toUpperCase();
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #7c3aed, #3b82f6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.4,
        fontWeight: 600,
        color: "#fff",
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────── */
export default function AdminStorage() {
  /* Overview */
  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  /* Per-user storage */
  const [userRows, setUserRows] = useState([]);
  const [userLoading, setUserLoading] = useState(true);

  /* File browser */
  const [search, setSearch] = useState("");
  const [fileSearch, setFileSearch] = useState("");
  const [fileResults, setFileResults] = useState([]);
  const [fileLoading, setFileLoading] = useState(false);

  /* Delete modal */
  const [deletingFile, setDeletingFile] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  /* ── Load overview + user rows ──────────────────────────── */
  const loadData = useCallback(async () => {
    setOverviewLoading(true);
    setUserLoading(true);
    try {
      const data = await apiFetch("/admin-storage-stats?page=1&limit=50");
      setOverview(data.overview || {});
      setUserRows(Array.isArray(data.users) ? data.users : []);
    } catch {
      setOverview({});
      setUserRows([]);
    } finally {
      setOverviewLoading(false);
      setUserLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ── Debounced file search ──────────────────────────────── */
  useEffect(() => {
    if (!fileSearch.trim()) {
      setFileResults([]);
      return;
    }
    setFileLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await apiFetch(
          `/admin-storage-stats?search=${encodeURIComponent(fileSearch)}`
        );
        setFileResults(Array.isArray(data.files) ? data.files : []);
      } catch {
        setFileResults([]);
      } finally {
        setFileLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [fileSearch]);

  /* ── Delete file ─────────────────────────────────────────── */
  async function handleDeleteFile() {
    if (!deletingFile) return;
    setDeleteLoading(true);
    try {
      await apiFetch("/admin-delete-file", {
        method: "POST",
        body: JSON.stringify({ fileId: deletingFile.id }),
      });
      setDeletingFile(null);
      loadData();
      setFileResults((prev) => prev.filter((f) => f.id !== deletingFile.id));
    } catch {
      // ignore
    } finally {
      setDeleteLoading(false);
    }
  }

  /* ── Derived values ─────────────────────────────────────── */
  const totalBytes = overview?.total_bytes || 0;
  const totalFiles = overview?.total_files || 0;
  const userCount = overview?.user_count || 0;
  const largestBytes = overview?.largest_file_bytes || 0;
  const largestName = overview?.largest_file_name || "";
  const avgBytes = userCount > 0 ? totalBytes / userCount : 0;

  const overQuotaUsers = userRows.filter((u) => {
    const quota = (u.storage_limit_gb || 5) * 1024 * 1024 * 1024;
    return (u.total_bytes || 0) > quota;
  });

  return (
    <div>
      <div className="admin-page-title">Storage</div>
      <div className="admin-page-sub">
        Monitor and manage file storage across all users.
      </div>

      {/* Overview stats */}
      <div className="admin-stats-grid">
        <AdminStatsCard
          icon={<HardDrive size={18} />}
          label="Total Storage"
          value={formatBytes(totalBytes)}
          loading={overviewLoading}
          color="#f97316"
        />
        <AdminStatsCard
          icon={<Files size={18} />}
          label="Total Files"
          value={totalFiles.toLocaleString()}
          loading={overviewLoading}
          color="#3b82f6"
        />
        <AdminStatsCard
          icon={<User size={18} />}
          label="Avg Per User"
          value={formatBytes(avgBytes)}
          loading={overviewLoading}
          color="#a78bfa"
        />
        <AdminStatsCard
          icon={<ArrowDown size={18} />}
          label="Largest File"
          value={`${formatBytes(largestBytes)}${largestName ? " · " + largestName : ""}`}
          loading={overviewLoading}
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
          <span
            style={{ fontSize: "12px", color: "var(--t3)", fontWeight: 400 }}
          >
            {userRows.length} users · sorted by usage
          </span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Plan</th>
                <th>Files</th>
                <th>Storage Used</th>
                <th>Quota</th>
                <th style={{ minWidth: "180px" }}>Usage Bar</th>
              </tr>
            </thead>
            <tbody>
              {userLoading ? (
                [0, 1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="admin-table-skeleton">
                    {[0, 1, 2, 3, 4, 5].map((j) => (
                      <td key={j}>
                        <span
                          className="admin-table-skeleton-row"
                          style={{ width: "70%" }}
                        />
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
                  const quota =
                    (u.storage_limit_gb || 5) * 1024 * 1024 * 1024;
                  const pct = Math.min(
                    100,
                    ((u.total_bytes || 0) / quota) * 100
                  );
                  const barColor =
                    pct > 90
                      ? "#ef4444"
                      : pct > 70
                      ? "#f59e0b"
                      : "#4ade80";
                  const isOver =
                    (u.total_bytes || 0) > quota;
                  return (
                    <tr key={u.id}>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                          }}
                        >
                          <Avatar name={u.full_name || u.email} />
                          <div>
                            <div
                              style={{
                                fontSize: "13px",
                                fontWeight: 500,
                                color: "var(--t1)",
                              }}
                            >
                              {u.full_name || "—"}
                            </div>
                            <div
                              style={{
                                fontSize: "11px",
                                color: "var(--t3)",
                              }}
                            >
                              {u.email || "—"}
                            </div>
                          </div>
                          {isOver && (
                            <span
                              style={{
                                fontSize: "10px",
                                fontWeight: 700,
                                background: "rgba(239,68,68,0.15)",
                                color: "#ef4444",
                                padding: "2px 6px",
                                borderRadius: "999px",
                                marginLeft: "4px",
                              }}
                            >
                              Over Quota
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: "11px",
                            padding: "2px 8px",
                            borderRadius: "999px",
                            background: "rgba(255,255,255,0.05)",
                            color: "var(--t2)",
                          }}
                        >
                          {u.plan_name || "Free"}
                        </span>
                      </td>
                      <td>{(u.file_count || 0).toLocaleString()}</td>
                      <td
                        style={{
                          color: isOver ? "#ef4444" : "var(--t1)",
                          fontWeight: isOver ? 600 : 400,
                        }}
                      >
                        {formatBytes(u.total_bytes || 0)}
                      </td>
                      <td style={{ color: "var(--t3)", fontSize: "12px" }}>
                        {u.storage_limit_gb || 5} GB
                      </td>
                      <td>
                        <div
                          style={{
                            width: "100%",
                            background: "var(--border)",
                            borderRadius: 4,
                            height: 6,
                          }}
                        >
                          <div
                            style={{
                              width: `${pct}%`,
                              background: barColor,
                              borderRadius: 4,
                              height: 6,
                            }}
                          />
                        </div>
                        <span
                          style={{
                            fontSize: 11,
                            color: pct > 90 ? "#ef4444" : "var(--t3)",
                          }}
                        >
                          {formatBytes(u.total_bytes || 0)} /{" "}
                          {u.storage_limit_gb || 5} GB
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* File browser section */}
      <div className="admin-section" style={{ marginBottom: "20px" }}>
        <div className="admin-section-title">
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Files size={16} />
            File Browser
          </span>
          <span
            style={{ fontSize: "12px", color: "var(--t3)", fontWeight: 400 }}
          >
            Search files across all users
          </span>
        </div>

        {/* Search */}
        <div
          style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)" }}
        >
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
              value={fileSearch}
              onChange={(e) => setFileSearch(e.target.value)}
            />
          </div>
        </div>

        {fileSearch.trim() && (
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
                  [0, 1, 2, 3].map((i) => (
                    <tr key={i} className="admin-table-skeleton">
                      {[0, 1, 2, 3, 4, 5].map((j) => (
                        <td key={j}>
                          <span
                            className="admin-table-skeleton-row"
                            style={{ width: "70%" }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : fileResults.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="admin-empty">
                        No files matching &ldquo;{fileSearch}&rdquo;.
                      </div>
                    </td>
                  </tr>
                ) : (
                  fileResults.map((f) => (
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
                          <div style={{ fontSize: "13px" }}>
                            {f.profiles?.full_name || f.full_name || "—"}
                          </div>
                          <div
                            style={{ fontSize: "11px", color: "var(--t3)" }}
                          >
                            {f.profiles?.email || f.email || "—"}
                          </div>
                        </div>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {formatBytes(f.file_size)}
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: "11px",
                            color: "var(--t3)",
                            fontFamily: "monospace",
                          }}
                        >
                          {f.content_type || "—"}
                        </span>
                      </td>
                      <td
                        style={{
                          whiteSpace: "nowrap",
                          color: "var(--t3)",
                          fontSize: "12px",
                        }}
                      >
                        {f.created_at
                          ? new Date(f.created_at).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                      </td>
                      <td>
                        <button
                          className="admin-action-btn danger"
                          onClick={() => setDeletingFile(f)}
                        >
                          <Trash size={13} /> Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {!fileSearch.trim() && (
          <div
            style={{
              padding: "32px 20px",
              textAlign: "center",
              color: "var(--t3)",
              fontSize: "13px",
            }}
          >
            Type a filename above to search files across all users.
          </div>
        )}
      </div>

      {/* Over-quota warning */}
      {overQuotaUsers.length > 0 && (
        <div
          className="admin-section"
          style={{
            border: "1px solid rgba(239,68,68,0.35)",
            marginBottom: "20px",
          }}
        >
          <div
            className="admin-section-title"
            style={{ color: "#ef4444" }}
          >
            <span
              style={{ display: "flex", alignItems: "center", gap: "8px" }}
            >
              <Warning size={16} weight="fill" style={{ color: "#ef4444" }} />
              Over Quota — {overQuotaUsers.length} user
              {overQuotaUsers.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div
            className="admin-section-body"
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            {overQuotaUsers.map((u) => {
              const quota =
                (u.storage_limit_gb || 5) * 1024 * 1024 * 1024;
              const pct = Math.round(((u.total_bytes || 0) / quota) * 100);
              return (
                <div
                  key={u.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                    padding: "12px 16px",
                    borderRadius: "8px",
                    background: "rgba(239,68,68,0.06)",
                    border: "1px solid rgba(239,68,68,0.2)",
                  }}
                >
                  <Warning
                    size={16}
                    weight="fill"
                    style={{ color: "#ef4444", flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: "13px" }}>
                      {u.full_name || u.email || "Unknown"}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--t3)" }}>
                      {u.email}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div
                      style={{
                        fontSize: "13px",
                        color: "#ef4444",
                        fontWeight: 600,
                      }}
                    >
                      {formatBytes(u.total_bytes || 0)} /{" "}
                      {u.storage_limit_gb || 5} GB
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--t3)" }}>
                      {pct}% used · {u.plan_name || "Free"}
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
