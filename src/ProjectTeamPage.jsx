import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { UserPlus, Trash, CaretDown, Users, Crown, Eye, PencilSimple } from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";
import { useProject } from "./context/ProjectContext";
import { membersApi } from "./lib/api";

const ROLES = ["viewer", "reviewer", "editor", "admin"];

function roleBadge(role) {
  const map = {
    owner:    { label: "Owner",    cls: "badge-approved" },
    admin:    { label: "Admin",    cls: "badge-review"   },
    editor:   { label: "Editor",   cls: "badge-neutral"  },
    reviewer: { label: "Reviewer", cls: "badge-neutral"  },
    viewer:   { label: "Viewer",   cls: "badge-neutral"  },
  };
  const s = map[role] || { label: role, cls: "badge-neutral" };
  return <span className={`media-status-badge ${s.cls}`}>{s.label}</span>;
}

export default function ProjectTeamPage() {
  const { user } = useAuth();
  const { id: projectId } = useParams();
  const { isOwner } = useProject();

  const [members,  setMembers]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [email,    setEmail]    = useState("");
  const [role,     setRole]     = useState("viewer");
  const [inviting, setInviting] = useState(false);
  const [error,    setError]    = useState("");

  const load = useCallback(() => {
    if (!projectId) return;
    setLoading(true);
    membersApi.list(projectId)
      .then(d => setMembers(d.members || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function handleInvite(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setError(""); setInviting(true);
    try {
      const d = await membersApi.invite({ project_id: projectId, email: email.trim(), role });
      setEmail(""); setRole("viewer");
      load();
    } catch (err) {
      setError(err.message || "Failed to invite");
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(memberId, newRole) {
    await membersApi.update(memberId, { role: newRole }).catch(() => {});
    setMembers(ms => ms.map(m => m.id === memberId ? { ...m, role: newRole } : m));
  }

  async function handleRemove(memberId) {
    if (!confirm("Remove this member from the project?")) return;
    await membersApi.remove(memberId).catch(() => {});
    setMembers(ms => ms.filter(m => m.id !== memberId));
  }

  return (
    <div className="project-team-tab">
      <h3 className="tab-section-title">Team Members</h3>

      {loading ? <div className="mpv-loading">Loading…</div> : (
        <div className="team-list">
          {members.map(m => {
            const profile = m.profiles || {};
            const name = profile.full_name || m.email || "Unknown";
            const initial = name.charAt(0).toUpperCase();
            return (
              <div key={m.id} className="team-row">
                <div className="team-avatar">
                  {profile.avatar_url
                    ? <img src={profile.avatar_url} alt={name} />
                    : <span>{initial}</span>}
                </div>
                <div className="team-info">
                  <div className="team-name">{name}</div>
                  {m.email && <div className="team-email">{m.email}</div>}
                </div>
                <div className="team-role">
                  {m.role === "owner" ? (
                    roleBadge("owner")
                  ) : isOwner ? (
                    <select
                      className="team-role-select"
                      value={m.role}
                      onChange={e => handleRoleChange(m.id, e.target.value)}
                    >
                      {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                    </select>
                  ) : (
                    roleBadge(m.role)
                  )}
                </div>
                {isOwner && m.role !== "owner" && (
                  <button className="icon-btn danger" onClick={() => handleRemove(m.id)} title="Remove">
                    <Trash size={14} />
                  </button>
                )}
              </div>
            );
          })}
          {members.length === 0 && (
            <div className="mpv-empty" style={{ padding: "32px 0" }}>
              <Users size={40} weight="duotone" style={{ opacity: 0.2 }} />
              <p>No team members yet.</p>
            </div>
          )}
        </div>
      )}

      {isOwner && (
        <div className="team-invite-section">
          <h3 className="tab-section-title">Invite Member</h3>
          <form onSubmit={handleInvite} className="team-invite-form">
            <input
              className="input-field"
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
            <select
              className="input-field"
              value={role}
              onChange={e => setRole(e.target.value)}
            >
              {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
            <button type="submit" className="btn-primary" disabled={inviting}>
              <UserPlus size={14} weight="bold" />
              {inviting ? "Inviting…" : "Invite"}
            </button>
          </form>
          {error && <div className="form-error">{error}</div>}
        </div>
      )}
    </div>
  );
}
