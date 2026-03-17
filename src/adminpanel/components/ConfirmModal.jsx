import React, { useEffect } from "react";
import { Warning } from "@phosphor-icons/react";

/**
 * ConfirmModal — destructive action confirmation dialog.
 * Props:
 *   title        — string, modal heading
 *   message      — string or ReactNode, body description
 *   confirmLabel — string label for the confirm button (default "Confirm")
 *   onConfirm    — async function called on confirm
 *   onClose      — function called on cancel or backdrop click
 *   loading      — boolean, disables buttons and shows loading state
 */
export default function ConfirmModal({
  title = "Are you sure?",
  message,
  confirmLabel = "Confirm",
  onConfirm,
  onClose,
  loading = false,
}) {
  /* Close on Escape */
  useEffect(() => {
    function handleKey(e) {
      if (e.key === "Escape" && !loading) onClose?.();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, loading]);

  /* Prevent body scroll while open */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  function handleBackdrop(e) {
    if (e.target === e.currentTarget && !loading) onClose?.();
  }

  return (
    <div className="admin-modal-backdrop" onClick={handleBackdrop}>
      <div
        className="admin-modal-card"
        style={{ maxWidth: "420px" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="admin-modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "28px",
                height: "28px",
                borderRadius: "8px",
                background: "rgba(248,113,113,0.12)",
                color: "#f87171",
                flexShrink: 0,
              }}
            >
              <Warning size={16} weight="bold" />
            </span>
            <span>{title}</span>
          </div>
        </div>

        {/* Body */}
        <div className="admin-modal-body">
          {message && (
            <p style={{ fontSize: "14px", color: "var(--t2)", lineHeight: 1.6 }}>
              {message}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="admin-modal-footer">
          <button
            className="admin-action-btn"
            onClick={onClose}
            disabled={loading}
            style={{ opacity: loading ? 0.5 : 1 }}
          >
            Cancel
          </button>
          <button
            className="admin-action-btn danger"
            onClick={onConfirm}
            disabled={loading}
            style={{
              background: loading ? "rgba(248,113,113,0.2)" : "rgba(248,113,113,0.15)",
              opacity: loading ? 0.7 : 1,
              cursor: loading ? "not-allowed" : "pointer",
              minWidth: "90px",
              justifyContent: "center",
            }}
          >
            {loading ? (
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Spinner />
                {confirmLabel}
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      style={{ animation: "spin 0.75s linear infinite" }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}
