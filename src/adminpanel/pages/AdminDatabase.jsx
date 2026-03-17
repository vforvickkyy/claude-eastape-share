import React, { useState, useEffect, useCallback } from "react";
import {
  PencilSimple,
  CaretLeft,
  CaretRight,
  DownloadSimple,
  MagnifyingGlass,
  Database,
  Check,
} from "@phosphor-icons/react";
import AdminModal from "../components/AdminModal";

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

async function auditLog(action, targetType, targetId, metadata = {}) {
  const { userId, headers } = getAuth();
  await fetch(`${BASE}/rest/v1/admin_audit_logs`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      admin_id: userId,
      action,
      target_type: targetType,
      target_id: String(targetId || ""),
      metadata,
    }),
  });
}

/* ── Constants ────────────────────────────────────────────── */
const TABLES = [
  "profiles",
  "shares",
  "folders",
  "media_projects",
  "media_folders",
  "media_assets",
  "media_asset_versions",
  "media_comments",
  "media_share_links",
  "media_team_members",
  "plans",
  "user_plans",
  "platform_settings",
  "admin_audit_logs",
];

const EDITABLE_TABLES = ["platform_settings", "plans"];
const PAGE_SIZE = 50;

/* ── Helpers ──────────────────────────────────────────────── */
function truncate(val, max = 80) {
  if (val === null || val === undefined) return "—";
  const str = typeof val === "object" ? JSON.stringify(val) : String(val);
  return str.length > max ? str.slice(0, max) + "…" : str;
}

function exportCSV(columns, rows, tableName) {
  const header = columns.join(",");
  const body = rows
    .map((row) =>
      columns
        .map((col) => {
          const v = row[col];
          const s =
            v === null || v === undefined
              ? ""
              : typeof v === "object"
              ? JSON.stringify(v)
              : String(v);
          return `"${s.replace(/"/g, '""')}"`;
        })
        .join(",")
    )
    .join("\n");
  const blob = new Blob([header + "\n" + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${tableName}_export.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── EditRecordModal ──────────────────────────────────────── */
function EditRecordModal({ table, row, onClose, onSaved }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!row) return;
    if (table === "platform_settings") {
      setForm({ value: row.value || "", description: row.description || "" });
    } else if (table === "plans") {
      setForm({
        name: row.name || "",
        price_monthly: row.price_monthly ?? "",
        price_yearly: row.price_yearly ?? "",
        storage_limit_gb: row.storage_limit_gb ?? "",
        file_size_limit_mb: row.file_size_limit_mb ?? "",
        max_shares: row.max_shares ?? "",
        features: row.features ? JSON.stringify(row.features, null, 2) : "{}",
      });
    }
  }, [row, table]);

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const { headers } = getAuth();
      let body = {};
      if (table === "platform_settings") {
        body = { value: form.value, description: form.description };
      } else if (table === "plans") {
        let parsedFeatures = {};
        try { parsedFeatures = JSON.parse(form.features || "{}"); } catch (e) { throw new Error("Invalid JSON in features field"); }
        body = {
          name: form.name,
          price_monthly: Number(form.price_monthly) || 0,
          price_yearly: Number(form.price_yearly) || 0,
          storage_limit_gb: Number(form.storage_limit_gb) || 0,
          file_size_limit_mb: Number(form.file_size_limit_mb) || 0,
          max_shares: Number(form.max_shares) || 0,
          features: parsedFeatures,
        };
      }
      const res = await fetch(`${BASE}/rest/v1/${table}?id=eq.${row.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      await auditLog(`Edited ${table} record`, table, row.id, body);
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    width: "100%",
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    padding: "8px 12px",
    color: "var(--t1)",
    fontSize: "13px",
    outline: "none",
  };

  const labelStyle = {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--t3)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    display: "block",
    marginBottom: "6px",
    marginTop: "14px",
  };

  return (
    <AdminModal
      title={`Edit ${table === "platform_settings" ? "Setting" : "Plan"}`}
      onClose={onClose}
      maxWidth="560px"
    >
      {table === "platform_settings" && (
        <>
          <label style={labelStyle}>Key</label>
          <input style={{ ...inputStyle, opacity: 0.5, cursor: "not-allowed" }} value={row?.key || ""} readOnly />
          <label style={labelStyle}>Value</label>
          <input
            style={inputStyle}
            value={form.value || ""}
            onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
          />
          <label style={labelStyle}>Description</label>
          <textarea
            style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
            value={form.description || ""}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </>
      )}

      {table === "plans" && (
        <>
          <label style={labelStyle}>Name</label>
          <input style={inputStyle} value={form.name || ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={labelStyle}>Price Monthly ($)</label>
              <input style={inputStyle} type="number" value={form.price_monthly} onChange={(e) => setForm((f) => ({ ...f, price_monthly: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Price Yearly ($)</label>
              <input style={inputStyle} type="number" value={form.price_yearly} onChange={(e) => setForm((f) => ({ ...f, price_yearly: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Storage Limit (GB)</label>
              <input style={inputStyle} type="number" value={form.storage_limit_gb} onChange={(e) => setForm((f) => ({ ...f, storage_limit_gb: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>File Size Limit (MB)</label>
              <input style={inputStyle} type="number" value={form.file_size_limit_mb} onChange={(e) => setForm((f) => ({ ...f, file_size_limit_mb: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Max Shares</label>
              <input style={inputStyle} type="number" value={form.max_shares} onChange={(e) => setForm((f) => ({ ...f, max_shares: e.target.value }))} />
            </div>
          </div>
          <label style={labelStyle}>Features (JSON)</label>
          <textarea
            style={{ ...inputStyle, minHeight: "120px", resize: "vertical", fontFamily: "monospace", fontSize: "12px" }}
            value={form.features || "{}"}
            onChange={(e) => setForm((f) => ({ ...f, features: e.target.value }))}
          />
        </>
      )}

      {error && (
        <div style={{ marginTop: "12px", padding: "8px 12px", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: "8px", color: "#f87171", fontSize: "12px" }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "20px", paddingTop: "16px", borderTop: "1px solid var(--border)" }}>
        <button className="admin-action-btn" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="admin-action-btn primary" onClick={handleSave} disabled={saving}>
          <Check size={14} />
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </AdminModal>
  );
}

/* ── Row Detail Modal ─────────────────────────────────────── */
function RowDetailModal({ row, onClose }) {
  return (
    <AdminModal title="Row Details" onClose={onClose} maxWidth="640px">
      <pre
        style={{
          fontFamily: "monospace",
          fontSize: "12px",
          color: "var(--t2)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          lineHeight: 1.6,
          background: "var(--bg)",
          padding: "16px",
          borderRadius: "8px",
          border: "1px solid var(--border)",
          maxHeight: "60vh",
          overflow: "auto",
        }}
      >
        {JSON.stringify(row, null, 2)}
      </pre>
    </AdminModal>
  );
}

/* ── Main Page ────────────────────────────────────────────── */
export default function AdminDatabase() {
  const [selectedTable, setSelectedTable] = useState(null);
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");
  const [editRow, setEditRow] = useState(null);
  const [detailRow, setDetailRow] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const fetchRows = useCallback(async (tableName, pageNum) => {
    if (!tableName) return;
    setLoading(true);
    try {
      const { headers } = getAuth();
      const offset = (pageNum - 1) * PAGE_SIZE;
      const res = await fetch(
        `${BASE}/rest/v1/${tableName}?select=*&limit=${PAGE_SIZE}&offset=${offset}&order=created_at.desc`,
        { headers: { ...headers, Prefer: "count=exact" } }
      );
      const countHeader = res.headers.get("content-range");
      if (countHeader) {
        const total = parseInt(countHeader.split("/")[1], 10);
        if (!isNaN(total)) setTotalCount(total);
      }
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setColumns(Object.keys(data[0]));
        setRows(data);
      } else {
        setRows([]);
        // Try to get columns from a single-row fetch
        const colRes = await fetch(`${BASE}/rest/v1/${tableName}?limit=1`, { headers });
        const colData = await colRes.json();
        if (Array.isArray(colData) && colData.length > 0) {
          setColumns(Object.keys(colData[0]));
        } else {
          setColumns([]);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  function selectTable(t) {
    setSelectedTable(t);
    setPage(1);
    setSearch("");
    setRows([]);
    setColumns([]);
    setTotalCount(0);
  }

  useEffect(() => {
    if (selectedTable) fetchRows(selectedTable, page);
  }, [selectedTable, page, fetchRows]);

  const filteredRows = search
    ? rows.filter((row) =>
        Object.values(row).some((v) =>
          String(v ?? "").toLowerCase().includes(search.toLowerCase())
        )
      )
    : rows;

  const isEditable = EDITABLE_TABLES.includes(selectedTable);

  return (
    <div>
      <div className="admin-page-title">Database</div>
      <div className="admin-page-sub">Browse and manage database tables directly.</div>

      <div style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}>
        {/* Sidebar */}
        <div
          style={{
            width: "180px",
            flexShrink: 0,
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "12px 14px",
              borderBottom: "1px solid var(--border)",
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--t3)",
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Database size={13} />
            Tables
          </div>
          {TABLES.map((t) => (
            <button
              key={t}
              onClick={() => selectTable(t)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "9px 14px",
                fontSize: "12px",
                color: selectedTable === t ? "#f97316" : "var(--t2)",
                background: selectedTable === t ? "rgba(249,115,22,0.08)" : "transparent",
                borderLeft: selectedTable === t ? "3px solid #f97316" : "3px solid transparent",
                transition: "all 0.15s",
                cursor: "pointer",
                display: "block",
                border: "none",
                outline: "none",
                borderLeft: selectedTable === t ? "3px solid #f97316" : "3px solid transparent",
              }}
              onMouseEnter={(e) => { if (selectedTable !== t) e.currentTarget.style.color = "var(--t1)"; }}
              onMouseLeave={(e) => { if (selectedTable !== t) e.currentTarget.style.color = "var(--t2)"; }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!selectedTable ? (
            <div className="admin-table-wrap">
              <div className="admin-empty">
                <Database size={40} weight="duotone" style={{ opacity: 0.25 }} />
                <span>Select a table from the sidebar to browse data</span>
              </div>
            </div>
          ) : (
            <div className="admin-table-wrap">
              {/* Table toolbar */}
              <div className="admin-table-header">
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: "14px" }}>{selectedTable}</div>
                  {!loading && (
                    <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "2px" }}>
                      {totalCount.toLocaleString()} total rows
                    </div>
                  )}
                </div>
                <div style={{ position: "relative" }}>
                  <MagnifyingGlass
                    size={13}
                    style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--t3)", pointerEvents: "none" }}
                  />
                  <input
                    className="admin-table-search"
                    style={{ paddingLeft: "30px", width: "200px" }}
                    placeholder="Filter rows…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <button
                  className="admin-action-btn"
                  onClick={() => exportCSV(columns, filteredRows, selectedTable)}
                  disabled={filteredRows.length === 0}
                >
                  <DownloadSimple size={13} />
                  Export CSV
                </button>
              </div>

              {/* Scrollable table */}
              <div style={{ overflowX: "auto" }}>
                {loading ? (
                  <div style={{ padding: "48px", textAlign: "center", color: "var(--t3)", fontSize: "13px" }}>
                    Loading…
                  </div>
                ) : filteredRows.length === 0 ? (
                  <div className="admin-empty">
                    <span>No rows found</span>
                  </div>
                ) : (
                  <table className="admin-table" style={{ minWidth: "600px" }}>
                    <thead>
                      <tr>
                        {columns.map((col) => (
                          <th key={col} style={{ whiteSpace: "nowrap" }}>{col}</th>
                        ))}
                        {isEditable && <th>Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row, i) => (
                        <tr
                          key={i}
                          style={{ cursor: "pointer" }}
                          onClick={() => setDetailRow(row)}
                        >
                          {columns.map((col) => (
                            <td
                              key={col}
                              title={
                                row[col] !== null && row[col] !== undefined
                                  ? typeof row[col] === "object"
                                    ? JSON.stringify(row[col])
                                    : String(row[col])
                                  : ""
                              }
                              style={{
                                maxWidth: "200px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                fontSize: "12px",
                              }}
                            >
                              {truncate(row[col])}
                            </td>
                          ))}
                          {isEditable && (
                            <td onClick={(e) => e.stopPropagation()}>
                              <button
                                className="admin-action-btn"
                                onClick={() => {
                                  setEditRow(row);
                                  setShowEditModal(true);
                                }}
                              >
                                <PencilSimple size={12} />
                                Edit
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Pagination */}
              {!loading && totalCount > PAGE_SIZE && (
                <div className="admin-pagination">
                  <span>
                    Page {page} of {totalPages} — {totalCount.toLocaleString()} rows
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
          )}
        </div>
      </div>

      {/* Edit modal */}
      {showEditModal && editRow && (
        <EditRecordModal
          table={selectedTable}
          row={editRow}
          onClose={() => { setShowEditModal(false); setEditRow(null); }}
          onSaved={() => { setShowEditModal(false); setEditRow(null); fetchRows(selectedTable, page); }}
        />
      )}

      {/* Row detail modal */}
      {detailRow && !showEditModal && (
        <RowDetailModal row={detailRow} onClose={() => setDetailRow(null)} />
      )}
    </div>
  );
}
