import React, { useEffect } from "react";
import { X } from "@phosphor-icons/react";

/**
 * AdminModal — reusable modal with backdrop blur.
 * Props:
 *   title     — string displayed in modal header
 *   onClose   — function called when backdrop or × is clicked
 *   children  — modal body content
 *   maxWidth  — CSS max-width string, default "520px"
 */
export default function AdminModal({ title, onClose, children, maxWidth = "520px" }) {
  /* Close on Escape */
  useEffect(() => {
    function handleKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  /* Prevent body scroll while open */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      className="admin-modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        className="admin-modal-card"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="admin-modal-header">
          <span>{title}</span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--t3)",
              display: "flex",
              alignItems: "center",
              padding: "2px",
              borderRadius: "6px",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--t1)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--t3)")}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="admin-modal-body">
          {children}
        </div>
      </div>
    </div>
  );
}
