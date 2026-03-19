import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Trash, FloppyDisk, Check } from "@phosphor-icons/react";
import { useProject } from "./context/ProjectContext";
import { projectsApi } from "./lib/api";

const COLOR_OPTS  = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#14b8a6"];
const STATUS_OPTS = ["active", "completed", "on_hold", "archived"];

export default function ProjectSettingsPage() {
  const navigate = useNavigate();
  const { id: projectId } = useParams();
  const { project, isOwner, refetch } = useProject();

  const [name,        setName]        = useState("");
  const [description, setDescription] = useState("");
  const [clientName,  setClientName]  = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [dueDate,     setDueDate]     = useState("");
  const [status,      setStatus]      = useState("active");
  const [color,       setColor]       = useState(COLOR_OPTS[0]);
  const [saving,      setSaving]      = useState(false);
  const [deleting,    setDeleting]    = useState(false);
  const [saved,       setSaved]       = useState(false);

  useEffect(() => {
    if (project) {
      setName(project.name || "");
      setDescription(project.description || "");
      setClientName(project.client_name || "");
      setClientEmail(project.client_email || "");
      setDueDate(project.due_date ? project.due_date.split("T")[0] : "");
      setStatus(project.status || "active");
      setColor(project.color || COLOR_OPTS[0]);
    }
  }, [project]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await projectsApi.update(projectId, {
        name, description, client_name: clientName, client_email: clientEmail,
        due_date: dueDate || null, status, color,
      });
      setSaved(true);
      refetch();
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirm("Delete this project permanently? All files and media will be lost. This cannot be undone.")) return;
    setDeleting(true);
    try {
      await projectsApi.delete(projectId);
      navigate("/projects");
    } catch { setDeleting(false); }
  }

  if (!isOwner) {
    return (
      <div className="project-settings-tab">
        <p style={{ opacity: 0.5, padding: "24px 0" }}>Only the project owner can change settings.</p>
      </div>
    );
  }

  return (
    <div className="project-settings-tab">
      <form onSubmit={handleSave}>
        <div className="settings-section">
          <h3 className="settings-section-title">General</h3>

          <div className="settings-field">
            <label>Project Name <span className="required">*</span></label>
            <input
              className="input-field"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </div>

          <div className="settings-field">
            <label>Description</label>
            <textarea
              className="input-field"
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional project description"
            />
          </div>

          <div className="settings-fields-row">
            <div className="settings-field">
              <label>Client Name</label>
              <input
                className="input-field"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
              />
            </div>
            <div className="settings-field">
              <label>Client Email</label>
              <input
                className="input-field"
                type="email"
                value={clientEmail}
                onChange={e => setClientEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="settings-fields-row">
            <div className="settings-field">
              <label>Status</label>
              <select className="input-field" value={status} onChange={e => setStatus(e.target.value)}>
                {STATUS_OPTS.map(s => (
                  <option key={s} value={s}>{s.replace("_", " ").replace(/^\w/, c => c.toUpperCase())}</option>
                ))}
              </select>
            </div>
            <div className="settings-field">
              <label>Due Date</label>
              <input
                className="input-field input-date"
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="settings-field">
            <label>Project Color</label>
            <div className="color-picker-row">
              {COLOR_OPTS.map(c => (
                <button
                  key={c} type="button"
                  className={`color-swatch ${color === c ? "selected" : ""}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
        </div>

        <button type="submit" className="btn-primary" disabled={saving} style={{ marginTop: 4 }}>
          {saved ? <><Check size={14} weight="bold" /> Saved</> : saving ? "Saving…" : <><FloppyDisk size={14} weight="bold" /> Save Changes</>}
        </button>
      </form>

      <div className="danger-zone">
        <h3 className="settings-section-title danger-title">Danger Zone</h3>
        <div className="danger-zone-row">
          <div>
            <div className="danger-zone-label">Delete Project</div>
            <div className="danger-zone-desc">Permanently delete this project and all its files.</div>
          </div>
          <button className="btn-danger" onClick={handleDelete} disabled={deleting}>
            <Trash size={14} weight="bold" />
            {deleting ? "Deleting…" : "Delete Project"}
          </button>
        </div>
      </div>
    </div>
  );
}
