import React, { useState, useEffect, useCallback } from "react";
import {
  CaretLeft,
  CaretRight,
  DownloadSimple,
  CaretDown,
  CaretUp,
  Copy,
  Check,
} from "@phosphor-icons/react";

/* ── Auth helper ──────────────────────────────────────────── */
function getAuth() {
  const session = JSON.parse(localStorage.getItem("ets_auth") || "{}");
  return {
    token: session.access_token,
    userId: session.user?.id,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
  };
}
const BASE = import.meta.env.VITE_SUPABASE_URL;

/* ── Helpers ──────────────────────────────────────────────── */
function formatDate(isoStr) {
  if (!isoStr) return "—";
  const d = new Date(isoStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }) + " " + d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

const TARGET_TYPE_OPTIONS = ["All", "user", "file", "video", "plan", "setting"];

const TARGET_COLORS = {
  user: { bg: "rgba(59,130,246,0.12)", color: "#60a5fa" },
  file: { bg: "rgba(74,222,128,0.12)", color: "#4ade80" },
  video: { bg: "rgba(139,92,246,0.12)", color: "#a78bfa" },
  plan: { bg: "rgba(249,115,22,0.12)", color: "#fb923c" },
  setting: { bg: "rgba(245,158,11,0.12)", color: "#fbbf24" },
};

function TargetBadge({ type }) {
  const colors = TARGET_COLORS[type] || { bg: "rgba(100,116,139,0.12)", color: "#94a3b8" };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "20px",
        fontSize: "11px",
        fontWeight: 600,
        background: colors.bg,
        color: colors.color,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}
    >
      {type || "—"}
    </span>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      onClick={handleCopy}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        color: copied ? "#4ade80" : "var(--t3)",
        display: "inline-flex",
        alignItems: "center",
        padding: "2px",
        borderRadius: "4px",
        transition: "color 0.15s",
        verticalAlign: "middle",
        marginLeft: "4px",
      }}
      title="Copy to clipboard"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

function exportCSV(logs) {
  const cols = ["id", "admin_name", "admin_email", "action", "target_type", "target_id", "created_at"];
  const header = cols.join(",");
  const body = logs.map((log) => {
    const row = {
      id: log.id || "",
      admin_name: log.profiles?.full_name || "",
      admin_email: log.profiles?.email || "",
      action: log.action || "",
      target_type: log.target_type || "",
      target_id: log.target_id || "",
      created_at: log.created_at || "",
    };
    return cols.map((c) => `"${String(row[c]).replace(/"/g, '""')}"`).join(",");
  }).join("\n");
  const blob = new Blob([header + "\n" + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "audit_logs_export.csv";
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Main Page ────────────────────────────────────────────── */
const PAGE_SIZE = 50;

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [expandedRow, setExpandedRow] = useState(null);

  // Filters
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [targetTypeFilter, setTargetTypeFilter] = useState("All");
  const [searchText, setSearchText] = useState("");

  const fetchLogs = useCallback(async (pageNum) => {
    setLoading(true);
    try {
      const { headers } = getAuth();
      const offset = (pageNum - 1) * PAGE_SIZE;

      let url = `${BASE}/rest/v1/admin_audit_logs?select=*,profiles(full_name,email)&order=created_at.desc&limit=${PAGE_SIZE}&offset=${offset}`;

      if (startDate) url += `&created_at=gte.${startDate}T00:00:00Z`;
      if (endDate) url += `&created_at=lte.${endDate}T23:59:59Z`;
      if (actionFilter) url += `&action=ilike.*${encodeURIComponent(actionFilter)}*`;
      if (targetTypeFilter !== "All") url += `&target_type=eq.${targetTypeFilter}`;

      const res = await fetch(url, { headers: { ...headers, Prefer: "count=exact" } });
      const countHeader = res.headers.get("content-range");
      if (countHeader) {
        const total = parseInt(countHeader.split("/")[1], 10);
        if (!isNaN(total)) setTotalCount(total);
      }
      const data = await res.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, actionFilter, targetTypeFilter]);

  useEffect(() => {
    setPage(1);
  }, [startDate, endDate, actionFilter, targetTypeFilter, searchText]);

  useEffect(() => {
    fetchLogs(page);
  }, [page, fetchLogs]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Client-side search filter
  const filteredLogs = searchText
    ? logs.filter((log) =>
        String(log.action || "").toLowerCase().includes(searchText.toLowerCase()) ||
        String(log.target_id || "").toLowerCase().includes(searchText.toLowerCase()) ||
        String(log.profiles?.full_name || "").toLowerCase().includes(searchText.toLowerCase()) ||
        String(log.profiles?.email || "").toLowerCase().includes(searchText.toLowerCase())
      )
    : logs;

  const inputStyle = {
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    padding: "7px 10px",
    color: "var(--t1)",
    fontSize: "12px",
    outline: "none",
  };

  return (
    <div>
      <div className="admin-page-title">Audit Logs</div>
      <div className="admin-page-sub">Track admin actions and system events.</div>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: "20px",
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "14px 16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: "0 0 auto" }}>
          <label style={{ fontSize: "11px", color: "var(--t3)", whiteSpace: "nowrap" }}>From</label>
          <input type="date" style={inputStyle} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: "0 0 auto" }}>
          <label style={{ fontSize: "11px", color: "var(--t3)", whiteSpace: "nowrap" }}>To</label>
          <input type="date" style={inputStyle} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <input
          style={{ ...inputStyle, width: "150px" }}
          placeholder="Action type…"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
        />
        <select
          style={{ ...inputStyle, cursor: "pointer" }}
          value={targetTypeFilter}
          onChange={(e) => setTargetTypeFilter(e.target.value)}
        >
          {TARGET_TYPE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt === "All" ? "All Target Types" : opt}</option>
          ))}
        </select>
        <input
          style={{ ...inputStyle, flex: 1, minWidth: "140px" }}
          placeholder="Search action text…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <button
          className="admin-action-btn"
          onClick={() => exportCSV(filteredLogs)}
          disabled={filteredLogs.length === 0}
          style={{ marginLeft: "auto", flexShrink: 0 }}
        >
          <DownloadSimple size={13} />
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="admin-table-wrap">
        <div className="admin-table-header" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 600, fontSize: "14px" }}>Audit Log Entries</div>
          {!loading && (
            <div style={{ fontSize: "11px", color: "var(--t3)" }}>
              {totalCount.toLocaleString()} total entries
            </div>
          )}
        </div>

        {loading ? (
          <div style={{ padding: "48px", textAlign: "center", color: "var(--t3)", fontSize: "13px" }}>
            Loading…
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="admin-empty">No log entries found.</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Admin</th>
                <th>Action</th>
                <th>Target Type</th>
                <th>Target ID</th>
                <th>Date</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => {
                const isExpanded = expandedRow === log.id;
                return (
                  <React.Fragment key={log.id}>
                    <tr
                      style={{ cursor: "pointer" }}
                      onClick={() => setExpandedRow(isExpanded ? null : log.id)}
                    >
                      <td>
                        <div style={{ fontWeight: 500, fontSize: "12px" }}>
                          {log.profiles?.full_name || "—"}
                        </div>
                        {log.profiles?.email && (
                          <div style={{ fontSize: "11px", color: "var(--t3)" }}>
                            {log.profiles.email}
                          </div>
                        )}
                      </td>
                      <td style={{ maxWidth: "280px" }}>
                        <span
                          title={log.action}
                          style={{
                            display: "block",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontSize: "12px",
                          }}
                        >
                          {log.action || "—"}
                        </span>
                      </td>
                      <td>
                        <TargetBadge type={log.target_type} />
                      </td>
                      <td style={{ fontFamily: "monospace", fontSize: "11px", color: "var(--t2)", maxWidth: "160px" }}>
                        <span title={log.target_id} style={{ display: "inline-block", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", verticalAlign: "middle" }}>
                          {log.target_id ? log.target_id.slice(0, 20) + (log.target_id.length > 20 ? "…" : "") : "—"}
                        </span>
                        {log.target_id && <CopyButton text={log.target_id} />}
                      </td>
                      <td style={{ fontSize: "12px", whiteSpace: "nowrap", color: "var(--t2)" }}>
                        {formatDate(log.created_at)}
                      </td>
                      <td>
                        <button
                          className="admin-action-btn"
                          onClick={(e) => { e.stopPropagation(); setExpandedRow(isExpanded ? null : log.id); }}
                          style={{ gap: "4px" }}
                        >
                          {isExpanded ? <CaretUp size={12} /> : <CaretDown size={12} />}
                          {isExpanded ? "Hide" : "Expand"}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={6} style={{ background: "var(--bg)", padding: "0" }}>
                          <div style={{ padding: "16px 20px" }}>
                            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--t3)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                              Metadata
                            </div>
                            <pre
                              style={{
                                fontFamily: "monospace",
                                fontSize: "12px",
                                color: "var(--t2)",
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-all",
                                lineHeight: 1.6,
                                background: "rgba(0,0,0,0.2)",
                                padding: "12px 14px",
                                borderRadius: "8px",
                                border: "1px solid var(--border)",
                                margin: 0,
                              }}
                            >
                              {JSON.stringify(log.metadata || {}, null, 2)}
                            </pre>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {!loading && totalCount > PAGE_SIZE && (
          <div className="admin-pagination">
            <span>
              Page {page} of {totalPages} — {totalCount.toLocaleString()} entries
            </span>
            <div className="admin-page-btns">
              <button className="admin-page-btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <CaretLeft size={12} />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                const p = start + i;
                if (p < 1 || p > totalPages) return null;
                return (
                  <button key={p} className={`admin-page-btn${p === page ? " active" : ""}`} onClick={() => setPage(p)}>
                    {p}
                  </button>
                );
              })}
              <button className="admin-page-btn" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                <CaretRight size={12} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
