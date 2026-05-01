import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  HardDrive, Files, User, Database, Warning,
  MagnifyingGlass, FileVideo, File, ArrowsDownUp,
} from "@phosphor-icons/react";
import AdminStatsCard from "../components/AdminStatsCard.jsx";

/* ── Auth helpers ─────────────────────────────────────────── */
function getAuth() {
  const s = JSON.parse(localStorage.getItem("ets_auth") || "{}");
  return { token: s.access_token };
}
async function apiFetch(path, opts = {}) {
  const { token } = getAuth();
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function formatBytes(b) {
  if (!b) return "0 B";
  if (b < 1024) return b + " B";
  if (b < 1024 ** 2) return (b / 1024).toFixed(1) + " KB";
  if (b < 1024 ** 3) return (b / 1024 ** 2).toFixed(1) + " MB";
  return (b / 1024 ** 3).toFixed(2) + " GB";
}

function Avatar({ name, avatarUrl, size = 28 }) {
  const initial = (name || "?").charAt(0).toUpperCase();
  if (avatarUrl) return <img src={avatarUrl} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.38, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
      {initial}
    </div>
  );
}

function StorageBar({ pct }) {
  const color = pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#22c55e";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 140 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.4s" }} />
      </div>
      <span style={{ fontSize: 11, minWidth: 28, textAlign: "right", fontWeight: 600, color: pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "var(--admin-text-dim)" }}>
        {pct}%
      </span>
    </div>
  );
}

export default function AdminStorage() {
  const [overview, setOverview]         = useState(null);
  const [overviewLoading, setOvLoad]    = useState(true);
  const [userRows, setUserRows]         = useState([]);
  const [userLoading, setUserLoading]   = useState(true);
  const [search, setSearch]             = useState("");
  const [sortField, setSortField]       = useState("total");
  const [sortDir, setSortDir]           = useState("desc");
  const [page, setPage]                 = useState(1);
  const PER_PAGE = 25;

  const load = useCallback(async () => {
    setOvLoad(true); setUserLoading(true);
    try {
      const data = await apiFetch("/admin-storage-stats?limit=500");
      setOverview(data.overview || {});
      setUserRows(Array.isArray(data.users) ? data.users : []);
    } catch {
      setOverview({}); setUserRows([]);
    } finally { setOvLoad(false); setUserLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── Sort + filter ─────────────────────────────────────── */
  function toggleSort(field) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
    setPage(1);
  }

  const filtered = userRows.filter(u => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return u.email?.toLowerCase().includes(q) || u.full_name?.toLowerCase().includes(q);
  });

  const sorted = [...filtered].sort((a, b) => {
    let va, vb;
    if (sortField === "name") { va = (a.full_name || a.email || "").toLowerCase(); vb = (b.full_name || b.email || "").toLowerCase(); }
    else if (sortField === "drive") { va = a.drive_bytes || 0; vb = b.drive_bytes || 0; }
    else if (sortField === "media") { va = a.media_bytes || 0; vb = b.media_bytes || 0; }
    else if (sortField === "files") { va = a.file_count || 0; vb = b.file_count || 0; }
    else { va = a.total_bytes || 0; vb = b.total_bytes || 0; }
    return sortDir === "asc" ? (va < vb ? -1 : 1) : (va > vb ? -1 : 1);
  });

  const totalPages = Math.ceil(sorted.length / PER_PAGE);
  const paged = sorted.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const ov = overview || {};
  const overQuota = userRows.filter(u => u.pct >= 100);

  function SortHeader({ field, children }) {
    const active = sortField === field;
    return (
      <th style={{ cursor: "pointer", userSelect: "none", color: active ? "var(--admin-accent)" : undefined }}
        onClick={() => toggleSort(field)}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {children}
          {active && <ArrowsDownUp size={11} weight="bold" style={{ opacity: 0.7 }} />}
        </span>
      </th>
    );
  }

  return (
    <div>
      <div className="admin-page-title">Storage</div>
      <div className="admin-page-sub">Monitor file storage across all users — Drive and Project Media.</div>

      {/* ── Overview stats ─────────────────────────────── */}
      <div className="admin-stats-grid" style={{ marginBottom: 24 }}>
        <AdminStatsCard icon={<HardDrive size={18} />}    label="Total Storage"    value={formatBytes(ov.total_bytes)}          loading={overviewLoading} color="#f97316" />
        <AdminStatsCard icon={<File size={18} />}         label="Drive Storage"    value={formatBytes(ov.drive_bytes)}          loading={overviewLoading} color="#3b82f6" />
        <AdminStatsCard icon={<FileVideo size={18} />}    label="Media Storage"    value={formatBytes(ov.media_bytes)}          loading={overviewLoading} color="#7c3aed" />
        <AdminStatsCard icon={<Files size={18} />}        label="Total Files"      value={(ov.total_files || 0).toLocaleString()} loading={overviewLoading} color="#059669" />
        <AdminStatsCard icon={<User size={18} />}         label="Avg Per User"     value={formatBytes(ov.avg_bytes_per_user)}   loading={overviewLoading} color="#0891b2" />
        <AdminStatsCard icon={<Database size={18} />}     label="Largest File"
          value={ov.largest_file_bytes ? `${formatBytes(ov.largest_file_bytes)}${ov.largest_file_name ? " · " + ov.largest_file_name.slice(0,20) : ""}` : "—"}
          loading={overviewLoading} color="#fbbf24" />
      </div>

      {/* ── Over-quota warning ─────────────────────────── */}
      {overQuota.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="admin-section" style={{ border: "1px solid rgba(239,68,68,0.35)", marginBottom: 20 }}>
          <div className="admin-section-title" style={{ color: "#ef4444" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Warning size={16} weight="fill" style={{ color: "#ef4444" }} />
              Over Quota — {overQuota.length} user{overQuota.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="admin-section-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {overQuota.map(u => (
              <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 14px", borderRadius: 8, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.18)" }}>
                <Warning size={15} weight="fill" style={{ color: "#ef4444", flexShrink: 0 }} />
                <Avatar name={u.full_name || u.email} size={26} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-text)" }}>{u.full_name || "—"}</div>
                  <div style={{ fontSize: 11, color: "var(--admin-text-muted)" }}>{u.email}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 13, color: "#ef4444", fontWeight: 600 }}>{formatBytes(u.total_bytes)} / {u.storage_limit_gb} GB</div>
                  <div style={{ fontSize: 11, color: "var(--admin-text-muted)" }}>{u.pct}% used · {u.plan_name}</div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Per-user storage table ─────────────────────── */}
      <div className="admin-section">
        <div className="admin-section-title">
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}><Database size={15} /> Storage by User</span>
          <span style={{ fontSize: 12, color: "var(--admin-text-muted)", fontWeight: 400 }}>{filtered.length} users · sorted by {sortField}</span>
        </div>

        {/* Search */}
        <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--admin-border)" }}>
          <div style={{ position: "relative", maxWidth: 280 }}>
            <MagnifyingGlass size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--admin-text-muted)", pointerEvents: "none" }} />
            <input className="admin-table-search" style={{ paddingLeft: 30, width: "100%", boxSizing: "border-box" }}
              placeholder="Search user…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <SortHeader field="name">User</SortHeader>
                <th>Plan</th>
                <SortHeader field="drive">Drive</SortHeader>
                <SortHeader field="media">Media</SortHeader>
                <SortHeader field="total">Total</SortHeader>
                <SortHeader field="files">Files</SortHeader>
                <th style={{ minWidth: 160 }}>Usage</th>
              </tr>
            </thead>
            <tbody>
              {userLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {[1,2,3,4,5,6,7].map(c => (
                      <td key={c}><div style={{ height: 12, borderRadius: 4, background: "var(--admin-border)", animation: "pulse 1.5s ease-in-out infinite", width: `${50 + c * 8}%` }} /></td>
                    ))}
                  </tr>
                ))
              ) : paged.length === 0 ? (
                <tr><td colSpan={7}><div className="admin-empty">No users found.</div></td></tr>
              ) : paged.map(u => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <Avatar name={u.full_name || u.email} avatarUrl={u.avatar_url} size={28} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-text)" }}>{u.full_name || "—"}</div>
                        <div style={{ fontSize: 11, color: "var(--admin-text-muted)" }}>{u.email}</div>
                      </div>
                      {u.pct >= 90 && (
                        <span style={{ fontSize: 10, fontWeight: 700, background: u.pct >= 100 ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)", color: u.pct >= 100 ? "#ef4444" : "#f59e0b", padding: "2px 6px", borderRadius: 999 }}>
                          {u.pct >= 100 ? "Over" : "Near"}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: u.plan_name === "Free" ? "rgba(255,255,255,0.06)" : "rgba(124,58,237,0.15)", color: u.plan_name === "Free" ? "var(--admin-text-dim)" : "#a78bfa", fontWeight: 600 }}>
                      {u.plan_name}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: "var(--admin-text-dim)" }}>{formatBytes(u.drive_bytes)}</td>
                  <td style={{ fontSize: 12, color: "var(--admin-text-dim)" }}>{formatBytes(u.media_bytes)}</td>
                  <td style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-text)" }}>{formatBytes(u.total_bytes)}</td>
                  <td style={{ fontSize: 12, color: "var(--admin-text-dim)" }}>
                    <span title={`Drive: ${u.drive_count} · Media: ${u.media_count}`}>{(u.file_count || 0).toLocaleString()}</span>
                  </td>
                  <td>
                    <StorageBar pct={u.pct || 0} />
                    <div style={{ fontSize: 10, color: "var(--admin-text-muted)", marginTop: 2 }}>of {u.storage_limit_gb} GB</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderTop: "1px solid var(--admin-border)" }}>
            <span style={{ fontSize: 12, color: "var(--admin-text-muted)" }}>
              {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, sorted.length)} of {sorted.length}
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="admin-action-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</button>
              <button className="admin-action-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
