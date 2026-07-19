import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Plus, Copy, CheckCircle, Trash, LinkSimple, Eye, EyeSlash, Lock, ChatCircle, PencilSimple } from "@phosphor-icons/react";
import { useProject } from "./context/ProjectContext";
import { shareLinksApi } from "./lib/api";

const ROLE_INFO = {
  viewer:   { label: "Viewer",   icon: Eye,          desc: "Anyone with the link can view and comment. No login required.",                       className: "role-badge-viewer" },
  reviewer: { label: "Reviewer", icon: ChatCircle,    desc: "Anyone can view and comment. Logging in with reviewer access unlocks review actions.", className: "role-badge-reviewer" },
  editor:   { label: "Editor",   icon: PencilSimple,  desc: "Anyone can view and comment. Logging in with editor access unlocks full editing.",      className: "role-badge-editor" },
};

export default function ProjectSharingPage() {
  const { id: projectId } = useParams();
  const { canManageSharing } = useProject();

  const [links,     setLinks]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [creating,  setCreating]  = useState(false);
  const [copied,    setCopied]    = useState(null);

  // New link form
  const [role,           setRole]           = useState("viewer");
  const [allowDownload,  setAllowDownload]  = useState(true);
  const [allowComments,  setAllowComments]  = useState(true);
  const [password,       setPassword]       = useState("");
  const [expiresAt,      setExpiresAt]      = useState("");

  const load = useCallback(() => {
    setLoading(true);
    shareLinksApi.list({ projectId })
      .then(d => setLinks(d.links || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    try {
      await shareLinksApi.create({
        project_id: projectId,
        role,
        allow_download: allowDownload,
        allow_comments: allowComments,
        password: password || null,
        expires_at: expiresAt || null,
      });
      setPassword(""); setExpiresAt("");
      load();
    } catch (err) {
      alert(err.message || "Failed to create share link.");
    } finally { setCreating(false); }
  }

  async function handleDelete(id) {
    if (!confirm("Revoke this share link?")) return;
    try {
      await shareLinksApi.delete(id);
    } catch (err) {
      alert(err.message || "Failed to revoke share link.");
      return;
    }
    setLinks(ls => ls.filter(l => l.id !== id));
  }

  async function copyLink(link) {
    const url = `${window.location.origin}/share/${link.short_token || link.token}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(link.id);
    setTimeout(() => setCopied(null), 2000);
  }

  const shareUrl = (link) => `${window.location.origin}/share/${link.short_token || link.token}`;

  return (
    <div className="project-sharing-tab">
      <h3 className="tab-section-title">Share Links</h3>

      {loading ? <div className="mpv-loading">Loading…</div> : (
        <div className="sharing-links-list">
          {links.length === 0 && (
            <div className="mpv-empty" style={{ padding: "24px 0" }}>
              <LinkSimple size={40} weight="duotone" style={{ opacity: 0.2 }} />
              <p>No share links yet.</p>
            </div>
          )}
          {links.map(link => (
            <div key={link.id} className="sharing-link-row">
              <div className="sharing-link-icon">
                <LinkSimple size={16} weight="duotone" />
              </div>
              <div className="sharing-link-info">
                <div className="sharing-link-url">
                  {shareUrl(link)}
                  {(() => {
                    const info = ROLE_INFO[link.role] || ROLE_INFO.viewer;
                    const RoleIcon = info.icon;
                    return (
                      <span className={`role-badge ${info.className}`} title={info.desc}>
                        <RoleIcon size={11} weight="bold" /> {info.label}
                      </span>
                    );
                  })()}
                </div>
                <div className="sharing-link-meta">
                  {link.allow_download && <span>Downloads ✓</span>}
                  {link.allow_comments && <span>Comments ✓</span>}
                  {link.password && <span><Lock size={11} /> Password</span>}
                  {link.expires_at && <span>Expires {new Date(link.expires_at).toLocaleDateString()}</span>}
                  <span>{link.view_count || 0} views</span>
                </div>
              </div>
              <div className="sharing-link-actions">
                <button title="Copy link" onClick={() => copyLink(link)}>
                  {copied === link.id ? <CheckCircle size={15} /> : <Copy size={15} />}
                </button>
                {canManageSharing && (
                  <button title="Revoke" onClick={() => handleDelete(link.id)}>
                    <Trash size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {canManageSharing && (
        <div className="sharing-create-section">
          <h3 className="tab-section-title">Create Share Link</h3>
          <form onSubmit={handleCreate} className="sharing-create-form">
            <div className="sharing-role-select">
              {Object.entries(ROLE_INFO).map(([key, info]) => {
                const RoleIcon = info.icon;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`sharing-role-opt ${role === key ? "active" : ""}`}
                    onClick={() => setRole(key)}
                  >
                    <RoleIcon size={16} weight="duotone" />
                    <div>
                      <div className="sharing-role-opt-label">{info.label}</div>
                      <div className="sharing-role-opt-desc">{info.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="sharing-toggles">
              <label className="toggle-label">
                <input type="checkbox" checked={allowDownload} onChange={e => setAllowDownload(e.target.checked)} />
                Allow Downloads
              </label>
              <label className="toggle-label">
                <input type="checkbox" checked={allowComments} onChange={e => setAllowComments(e.target.checked)} />
                Allow Comments
              </label>
            </div>
            <div className="sharing-fields-row">
              <div className="input-with-icon">
                <Lock size={14} />
                <input
                  className="input-field"
                  type="text"
                  placeholder="Password (optional)"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>
              <input
                className="input-field"
                type="date"
                placeholder="Expires"
                value={expiresAt}
                onChange={e => setExpiresAt(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
              />
            </div>
            <button type="submit" className="btn-primary" disabled={creating}>
              <Plus size={14} weight="bold" />
              {creating ? "Creating…" : "Create Link"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
