import React, { useState, useEffect, useRef } from "react";
import { MagnifyingGlass, CaretLeft, CaretRight } from "@phosphor-icons/react";

/**
 * AdminTable — reusable paginated table with search.
 *
 * Props:
 *   columns          — array of { key, label, render? }
 *                      render(value, row) → ReactNode
 *   data             — array of row objects
 *   loading          — boolean, shows skeleton rows
 *   page             — current page number (1-based)
 *   totalPages       — total number of pages
 *   onPageChange     — (newPage) => void
 *   onSearch         — (query) => void  (debounced 300ms internally)
 *   searchPlaceholder— string
 *   emptyMessage     — string shown when data is empty
 *   totalCount       — optional total record count for "Showing X of Y"
 *   actions          — optional ReactNode rendered in table header right side
 */
export default function AdminTable({
  columns = [],
  data = [],
  loading = false,
  page = 1,
  totalPages = 1,
  onPageChange,
  onSearch,
  searchPlaceholder = "Search…",
  emptyMessage = "No records found.",
  totalCount,
  actions,
}) {
  const [searchValue, setSearchValue] = useState("");
  const debounceRef = useRef(null);

  /* Debounce search */
  useEffect(() => {
    if (!onSearch) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearch(searchValue);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchValue, onSearch]);

  const SKELETON_ROWS = 6;

  /* Page numbers to render */
  function buildPageNumbers() {
    if (totalPages <= 1) return [];
    const pages = [];
    const delta = 1;
    const left  = page - delta;
    const right = page + delta;

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= left && i <= right)) {
        pages.push(i);
      }
    }

    /* Insert ellipsis markers */
    const withEllipsis = [];
    let prev = null;
    for (const p of pages) {
      if (prev !== null && p - prev > 1) withEllipsis.push("…");
      withEllipsis.push(p);
      prev = p;
    }
    return withEllipsis;
  }

  const pageNums = buildPageNumbers();

  const rowStart = data.length === 0 ? 0 : (page - 1) * data.length + 1;
  const rowEnd   = (page - 1) * data.length + data.length;
  const total    = totalCount ?? (totalPages * (data.length || 10));

  return (
    <div className="admin-table-wrap">
      {/* Table header with search + optional actions */}
      <div className="admin-table-header">
        {/* Search input */}
        {onSearch && (
          <div style={{ position: "relative", flex: 1, maxWidth: "320px" }}>
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
              style={{ paddingLeft: "30px" }}
              type="text"
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
            />
          </div>
        )}

        {/* Right-side actions */}
        {actions && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "auto" }}>
            {actions}
          </div>
        )}
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table className="admin-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key}>{col.label}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              /* Skeleton rows */
              Array.from({ length: SKELETON_ROWS }).map((_, ri) => (
                <tr key={ri} className="admin-table-skeleton">
                  {columns.map((col) => (
                    <td key={col.key}>
                      <span
                        className="admin-table-skeleton-row"
                        style={{ width: `${55 + Math.random() * 35}%` }}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              /* Empty state */
              <tr>
                <td colSpan={columns.length}>
                  <div className="admin-empty">
                    <span>{emptyMessage}</span>
                  </div>
                </td>
              </tr>
            ) : (
              /* Data rows */
              data.map((row, ri) => (
                <tr key={row.id ?? ri}>
                  {columns.map((col) => (
                    <td key={col.key}>
                      {col.render
                        ? col.render(row[col.key], row)
                        : row[col.key] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {(totalPages > 1 || data.length > 0) && !loading && (
        <div className="admin-pagination">
          {/* Info */}
          <span>
            {data.length > 0
              ? `Showing ${rowStart}–${rowEnd}${totalCount ? ` of ${totalCount}` : ""}`
              : "No results"}
          </span>

          {/* Page buttons */}
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <button
                className="admin-page-btn"
                onClick={() => onPageChange?.(page - 1)}
                disabled={page <= 1}
                aria-label="Previous page"
              >
                <CaretLeft size={12} />
              </button>

              <div className="admin-page-btns">
                {pageNums.map((p, i) =>
                  p === "…" ? (
                    <span
                      key={`ellipsis-${i}`}
                      style={{ padding: "4px 6px", color: "var(--t3)", fontSize: "12px" }}
                    >
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      className={`admin-page-btn ${p === page ? "active" : ""}`}
                      onClick={() => onPageChange?.(p)}
                    >
                      {p}
                    </button>
                  )
                )}
              </div>

              <button
                className="admin-page-btn"
                onClick={() => onPageChange?.(page + 1)}
                disabled={page >= totalPages}
                aria-label="Next page"
              >
                <CaretRight size={12} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
