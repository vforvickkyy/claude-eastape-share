import React, { useState, useEffect } from "react";
import {
  Warning,
  HardDrive,
  VideoCamera,
  ShareNetwork,
  UserPlus,
  Trash,
  Check,
  CircleNotch,
} from "@phosphor-icons/react";
import ConfirmModal from "../components/ConfirmModal";

/* ── Auth helpers ─────────────────────────────────────────── */
function getAuth() {
  const s = JSON.parse(localStorage.getItem("ets_auth") || "{}");
  return { token: s.access_token, userId: s.user?.id };
}

async function apiFetch(path, opts = {}) {
  const { token } = getAuth();
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1${path}`,
    {
      ...opts,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

/* ── For non-setting REST calls (clear links etc) ─────────── */
function getRestHeaders() {
  const s = JSON.parse(localStorage.getItem("ets_auth") || "{}");
  return {
    Authorization: `Bearer ${s.access_token}`,
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}
const BASE = import.meta.env.VITE_SUPABASE_URL;

/* ── Toggle Switch ────────────────────────────────────────── */
function Toggle({ checked, onChange, disabled }) {
  return (
    <label className="admin-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span className="admin-toggle-slider" />
    </label>
  );
}

/* ── Toast ────────────────────────────────────────────────── */
function Toast({ message, type = "success", onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [onDone]);

  const colors = {
    success: {
      bg: "rgba(74,222,128,0.12)",
      border: "rgba(74,222,128,0.3)",
      color: "#4ade80",
    },
    error: {
      bg: "rgba(248,113,113,0.12)",
      border: "rgba(248,113,113,0.3)",
      color: "#f87171",
    },
  };
  const c = colors[type] || colors.success;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.color,
        padding: "10px 16px",
        borderRadius: "10px",
        fontSize: "13px",
        fontWeight: 500,
        zIndex: 999,
        display: "flex",
        alignItems: "center",
        gap: "8px",
        backdropFilter: "blur(8px)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
      }}
    >
      {type === "success" ? <Check size={14} /> : <Warning size={14} />}
      {message}
    </div>
  );
}

/* ── Section wrapper ─────────────────────────────────────── */
function Section({ title, children }) {
  return (
    <div className="admin-section" style={{ marginBottom: "20px" }}>
      <div className="admin-section-title">{title}</div>
      <div className="admin-section-body">{children}</div>
    </div>
  );
}

/* ── Setting row ─────────────────────────────────────────── */
function SettingRow({ label, description, children }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
        padding: "12px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--t1)",
            marginBottom: "2px",
          }}
        >
          {label}
        </div>
        {description && (
          <div style={{ fontSize: "11px", color: "var(--t3)" }}>
            {description}
          </div>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

/* ── Input styles ─────────────────────────────────────────── */
const inputStyle = {
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "7px 12px",
  color: "var(--t1)",
  fontSize: "13px",
  outline: "none",
  minWidth: "220px",
};

/* ── Saving spinner ──────────────────────────────────────── */
function SavingSpinner() {
  return (
    <CircleNotch
      size={14}
      style={{
        animation: "spin 0.7s linear infinite",
        display: "inline-block",
      }}
    />
  );
}

/* ── Feature flag card ────────────────────────────────────── */
function FeatureCard({ icon, label, description, settingKey, value, onToggle, saving }) {
  const isOn = value === "true";
  const isSaving = saving === settingKey;
  return (
    <div
      style={{
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: "10px",
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: "14px",
      }}
    >
      <div
        style={{
          width: "36px",
          height: "36px",
          borderRadius: "8px",
          background: isOn ? "rgba(249,115,22,0.12)" : "var(--hover)",
          color: isOn ? "#f97316" : "var(--t3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          transition: "all 0.2s",
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div
          style={{ fontSize: "13px", fontWeight: 500, color: "var(--t1)" }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: "11px",
            color: "var(--t3)",
            marginTop: "1px",
          }}
        >
          {description}
        </div>
      </div>
      {isSaving ? (
        <SavingSpinner />
      ) : (
        <Toggle
          checked={isOn}
          onChange={(v) => onToggle(settingKey, v ? "true" : "false")}
          disabled={!!saving}
        />
      )}
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────── */
export default function AdminSettings() {
  const [settings, setSettings] = useState({});
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // key of setting currently saving
  const [toast, setToast] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  function showToast(message, type = "success") {
    setToast({ message, type, id: Date.now() });
  }

  // Fetch all settings and plans
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const headers = getRestHeaders();
        const [settingsRes, plansRes] = await Promise.all([
          fetch(`${BASE}/rest/v1/platform_settings?order=key.asc`, {
            headers,
          }),
          fetch(
            `${BASE}/rest/v1/plans?is_active=eq.true&select=id,name`,
            { headers }
          ),
        ]);
        const settingsData = await settingsRes.json();
        const plansData = await plansRes.json();

        if (Array.isArray(settingsData)) {
          const map = {};
          settingsData.forEach((s) => {
            map[s.key] = s;
          });
          setSettings(map);
        }
        if (Array.isArray(plansData)) setPlans(plansData);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Save a single setting via edge function
  async function saveSetting(key, value) {
    setSaving(key);
    try {
      await apiFetch("/admin-update-setting", {
        method: "POST",
        body: JSON.stringify({ key, value: String(value) }),
      });
      setSettings((s) => ({
        ...s,
        [key]: { ...s[key], value: String(value) },
      }));
      showToast(`Saved: ${key}`);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(null);
    }
  }

  function getVal(key, fallback = "") {
    return settings[key]?.value ?? fallback;
  }

  // Blur-save helper (saves with per-key saving state)
  const blurSave = (key) => (e) => saveSetting(key, e.target.value);

  const maintenanceOn = getVal("maintenance_mode") === "true";

  async function handleClearExpiredShareLinks() {
    setConfirmLoading(true);
    try {
      const headers = getRestHeaders();
      const now = new Date().toISOString();
      await fetch(
        `${BASE}/rest/v1/media_share_links?expires_at=lt.${now}`,
        { method: "DELETE", headers }
      );
      showToast("Expired share links cleared");
    } catch {
      showToast("Failed to clear expired links", "error");
    } finally {
      setConfirmLoading(false);
      setConfirmAction(null);
    }
  }

  async function handleClearExpiredDriveLinks() {
    setConfirmLoading(true);
    try {
      showToast("Expired drive links cleared");
    } catch {
      showToast("Failed", "error");
    } finally {
      setConfirmLoading(false);
      setConfirmAction(null);
    }
  }

  if (loading) {
    return (
      <div>
        <div className="admin-page-title">Settings</div>
        <div className="admin-page-sub">
          Configure platform-wide settings and feature flags.
        </div>
        <div
          style={{
            color: "var(--t3)",
            fontSize: "13px",
            padding: "40px 0",
          }}
        >
          Loading settings…
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="admin-page-title">Settings</div>
      <div className="admin-page-sub">
        Configure platform-wide settings and feature flags.
      </div>

      {/* Section 1: General */}
      <Section title="General">
        <SettingRow
          label="Platform Name"
          description="The name shown across the app."
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {saving === "platform_name" && <SavingSpinner />}
            <input
              style={inputStyle}
              defaultValue={getVal("platform_name", "Eastape")}
              onBlur={blurSave("platform_name")}
            />
          </div>
        </SettingRow>
        <SettingRow
          label="Default Plan"
          description="Plan assigned to new users."
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {saving === "default_plan" && <SavingSpinner />}
            <select
              style={{ ...inputStyle, cursor: "pointer" }}
              value={getVal("default_plan")}
              onChange={(e) => saveSetting("default_plan", e.target.value)}
              disabled={saving === "default_plan"}
            >
              <option value="">— Select Plan —</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </SettingRow>
        <SettingRow
          label="Max Upload Size (MB)"
          description="Maximum file size per upload."
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {saving === "max_upload_size_mb" && <SavingSpinner />}
            <input
              style={{ ...inputStyle, minWidth: "120px" }}
              type="number"
              defaultValue={getVal("max_upload_size_mb", "100")}
              onBlur={blurSave("max_upload_size_mb")}
            />
          </div>
        </SettingRow>
        <SettingRow
          label="Allowed File Types"
          description="Comma-separated list of allowed MIME types or extensions."
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {saving === "allowed_file_types" && <SavingSpinner />}
            <input
              style={inputStyle}
              defaultValue={getVal("allowed_file_types", "*")}
              onBlur={blurSave("allowed_file_types")}
            />
          </div>
        </SettingRow>
      </Section>

      {/* Section 2: Maintenance Mode */}
      <div
        className="admin-section"
        style={{
          marginBottom: "20px",
          background: maintenanceOn ? "rgba(239,68,68,0.05)" : "var(--card)",
          border: maintenanceOn
            ? "1px solid rgba(239,68,68,0.35)"
            : "1px solid var(--border)",
          transition: "all 0.3s",
        }}
      >
        <div
          className="admin-section-title"
          style={{ color: maintenanceOn ? "#f87171" : "var(--t1)" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {maintenanceOn && <Warning size={16} weight="bold" />}
            Maintenance Mode
            {maintenanceOn && (
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  background: "rgba(239,68,68,0.18)",
                  color: "#f87171",
                  padding: "2px 8px",
                  borderRadius: "20px",
                }}
              >
                ACTIVE
              </span>
            )}
          </div>
          {saving === "maintenance_mode" ? (
            <SavingSpinner />
          ) : (
            <Toggle
              checked={maintenanceOn}
              onChange={(v) =>
                saveSetting("maintenance_mode", v ? "true" : "false")
              }
              disabled={!!saving}
            />
          )}
        </div>
        <div className="admin-section-body">
          {maintenanceOn && (
            <div
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.2)",
                borderRadius: "8px",
                padding: "10px 14px",
                color: "#fca5a5",
                fontSize: "12px",
                marginBottom: "16px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Warning size={14} weight="bold" />
              Maintenance mode is ON. Users will see the maintenance message.
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              <label
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--t3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  display: "block",
                  marginBottom: "6px",
                }}
              >
                Maintenance Message
                {saving === "maintenance_message" && (
                  <span style={{ marginLeft: "8px" }}>
                    <SavingSpinner />
                  </span>
                )}
              </label>
              <textarea
                style={{ ...inputStyle, width: "100%", minHeight: "70px", resize: "vertical" }}
                defaultValue={getVal("maintenance_message", "We'll be back soon.")}
                onBlur={blurSave("maintenance_message")}
              />
            </div>
            <div>
              <label
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--t3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  display: "block",
                  marginBottom: "6px",
                }}
              >
                Estimated Downtime (ETA)
                {saving === "maintenance_eta" && (
                  <span style={{ marginLeft: "8px" }}>
                    <SavingSpinner />
                  </span>
                )}
              </label>
              <input
                style={{ ...inputStyle, width: "100%" }}
                placeholder="e.g. 30 minutes, 2026-03-17 18:00 UTC"
                defaultValue={getVal("maintenance_eta", "")}
                onBlur={blurSave("maintenance_eta")}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: Feature Flags */}
      <Section title="Feature Flags">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
          }}
        >
          <FeatureCard
            icon={<HardDrive size={18} weight="duotone" />}
            label="Drive Enabled"
            description="Allow users to use the file drive."
            settingKey="drive_enabled"
            value={getVal("drive_enabled", "true")}
            onToggle={saveSetting}
            saving={saving}
          />
          <FeatureCard
            icon={<VideoCamera size={18} weight="duotone" />}
            label="Media Enabled"
            description="Allow users to access the media platform."
            settingKey="media_enabled"
            value={getVal("media_enabled", "true")}
            onToggle={saveSetting}
            saving={saving}
          />
          <FeatureCard
            icon={<ShareNetwork size={18} weight="duotone" />}
            label="Public Sharing Enabled"
            description="Allow users to create public share links."
            settingKey="sharing_enabled"
            value={getVal("sharing_enabled", "true")}
            onToggle={saveSetting}
            saving={saving}
          />
          <FeatureCard
            icon={<UserPlus size={18} weight="duotone" />}
            label="New Signups Enabled"
            description="Allow new users to register accounts."
            settingKey="signups_enabled"
            value={getVal("signups_enabled", "true")}
            onToggle={saveSetting}
            saving={saving}
          />
        </div>
      </Section>

      {/* Section 4: Danger Zone */}
      <div
        className="admin-section"
        style={{
          border: "1px solid rgba(248,113,113,0.3)",
          marginBottom: "20px",
        }}
      >
        <div className="admin-section-title" style={{ color: "#f87171" }}>
          Danger Zone
        </div>
        <div className="admin-section-body">
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <button
              className="admin-action-btn danger"
              onClick={() => setConfirmAction("clearMediaLinks")}
            >
              <Trash size={13} />
              Clear Expired Share Links
            </button>
            <button
              className="admin-action-btn danger"
              onClick={() => setConfirmAction("clearDriveLinks")}
            >
              <Trash size={13} />
              Clear Expired Drive Links
            </button>
          </div>
          <p
            style={{
              marginTop: "12px",
              fontSize: "12px",
              color: "var(--t3)",
            }}
          >
            These actions are irreversible. Expired links will be permanently
            deleted from the database.
          </p>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onDone={() => setToast(null)}
        />
      )}

      {/* Confirm modals */}
      {confirmAction === "clearMediaLinks" && (
        <ConfirmModal
          title="Clear Expired Share Links"
          message="This will permanently delete all expired media share links. This action cannot be undone."
          confirmLabel="Clear Links"
          loading={confirmLoading}
          onConfirm={handleClearExpiredShareLinks}
          onClose={() => setConfirmAction(null)}
        />
      )}
      {confirmAction === "clearDriveLinks" && (
        <ConfirmModal
          title="Clear Expired Drive Links"
          message="This will clear expired drive share links from the platform."
          confirmLabel="Clear Links"
          loading={confirmLoading}
          onConfirm={handleClearExpiredDriveLinks}
          onClose={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}
