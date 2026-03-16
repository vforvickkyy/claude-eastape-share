/**
 * TeamPanel — manage team members for a media project.
 * Slides in from the right as a side panel.
 */
import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { UserPlus, X, Trash, CaretDown } from "@phosphor-icons/react";
import { userApiFetch } from "../../lib/userApi";

const ROLES = ["owner", "editor", "reviewer", "viewer"];

export default function TeamPanel({ projectId, onClose }) {
  const [members,  setMembers]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [email,    setEmail]    = useState("");
  const [role,     setRole]     = useState("viewer");
  const [inviting, setInviting] = useState(false);
  const [error,    setError]    = useState("");

  useEffect(() => {
    userApiFetch(`/api/media/team?projectId=${projectId}`)
      .then(d => setMembers(d.members || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [projectId]);

  async function invite(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setInviting(true); setError("");
    try {
      const data = await userApiFetch("/api/media/team", {
        method: "POST",
        body: JSON.stringify({ projectId, email: email.trim(), role }),
      });
      setMembers(ms => [...ms, data.member]);
      setEmail("");
    } catch (err) {
      setError(err.message || "Failed to invite");
    } finally {
      setInviting(false);
    }
  }

  async function changeRole(id, newRole) {
    await userApiFetch(`/api/media/team?id=${id}`, {
      method: "PUT",
      body: JSON.stringify({ role: newRole }),
    });
    setMembers(ms => ms.map(m => m.id === id ? { ...m, role: newRole } : m));
  }

  async function remove(id) {
    if (!window.confirm("Remove this member?")) return;
    await userApiFetch(`/api/media/team?id=${id}`, { method: "DELETE" });
    setMembers(ms => ms.filter(m => m.id !== id));
  }

  return (
    <motion.div
      className="upload-panel-overlay"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <motion.div
        className="upload-panel"
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 280 }}
      >
        <div className="upload-panel-header">
          <span className="upload-panel-title">Team Members</span>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Invite form */}
        <form onSubmit={invite} style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <div className="form-group">
            <label className="form-label">Invite by email</label>
            <input
              className="form-input"
              type="email"
              placeholder="colleague@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
            <select className="media-filter-select" value={role} onChange={e => setRole(e.target.value)}>
              {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
            <button type="submit" className="btn-primary-sm" disabled={inviting}>
              {inviting ? <><span className="spinner" /> Inviting…</> : <><UserPlus size={13} /> Invite</>}
            </button>
          </div>
          {error && <p style={{ color: "#f87171", fontSize: 12, marginTop: 6 }}>{error}</p>}
        </form>

        {/* Members list */}
        <div style={{ overflowY: "auto", flex: 1, padding: "12px 20px" }}>
          {loading ? (
            <div className="empty-state"><span className="spinner" /></div>
          ) : members.length === 0 ? (
            <p style={{ color: "var(--t3)", fontSize: 13, padding: "24px 0", textAlign: "center" }}>
              No team members yet. Invite someone above.
            </p>
          ) : (
            members.map(m => (
              <div key={m.id} className="team-member-row">
                <div className="team-member-avatar">{(m.invited_email || "?").charAt(0).toUpperCase()}</div>
                <div className="team-member-info">
                  <span className="team-member-email">{m.invited_email || "—"}</span>
                  {!m.accepted && <span className="team-member-pending">Pending</span>}
                </div>
                <select
                  className="media-filter-select"
                  value={m.role}
                  onChange={e => changeRole(m.id, e.target.value)}
                  style={{ marginLeft: "auto" }}
                >
                  {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
                <button className="icon-btn danger" onClick={() => remove(m.id)} style={{ marginLeft: 6 }}>
                  <Trash size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
