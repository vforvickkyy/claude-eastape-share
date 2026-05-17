import React, { useState, useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Envelope, PaperPlane, ClockCounterClockwise, Code, Eye,
  ArrowCounterClockwise, FloppyDisk, CaretRight, X, MagnifyingGlass,
  CheckCircle, Warning, ArrowSquareOut, Spinner, Copy, Check,
  Lightning, ShieldCheck, CreditCard, UserCircle, Wrench, DownloadSimple,
} from "@phosphor-icons/react";

const BASE_FN    = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const SUPA_URL   = import.meta.env.VITE_SUPABASE_URL;
const SUPA_KEY   = import.meta.env.VITE_SUPABASE_ANON_KEY;

function getAuth() {
  const s = JSON.parse(localStorage.getItem("ets_auth") || "{}");
  return { token: s.access_token, userId: s.user?.id };
}
function authHeaders() {
  const { token } = getAuth();
  return { Authorization: `Bearer ${token}`, apikey: SUPA_KEY, "Content-Type": "application/json" };
}
async function apiFetch(path, opts = {}) {
  const { token } = getAuth();
  const res = await fetch(`${BASE_FN}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || "Request failed");
  return d;
}

/* ── Template definitions ──────────────────────────────────────── */
const TEMPLATE_DEFS = [
  {
    key: "welcome",  name: "Welcome Email",
    description: "Sent when a new user account is created.",
    category: "Onboarding",
    defaultSubject: "Welcome to Eastape Studio",
    sampleData: { name: "Jane Doe" },
    variables: [{ name: "name", example: "Jane Doe", desc: "User's full name" }],
  },
  {
    key: "otp", name: "Verification Code",
    description: "OTP email with a 6-digit code for verification.",
    category: "Auth",
    defaultSubject: "Your Eastape Studio verification code",
    sampleData: { code: "847293" },
    variables: [{ name: "code", example: "847293", desc: "6-digit OTP code" }],
  },
  {
    key: "passwordReset", name: "Password Reset",
    description: "Sent when a user requests a password reset.",
    category: "Auth",
    defaultSubject: "Reset your Eastape Studio password",
    sampleData: { resetUrl: "https://studio.eastape.com/auth/reset?token=sample123" },
    variables: [
      { name: "resetUrl", example: "https://studio.eastape.com/auth/reset?token=…", desc: "Reset URL (expires in 30 min)" },
    ],
  },
  {
    key: "securityAlert", name: "New Sign-in Alert",
    description: "Sent when a new sign-in is detected from an unfamiliar device.",
    category: "Security",
    defaultSubject: "New sign-in detected on your Eastape Studio account",
    sampleData: { device: "Chrome on macOS", location: "San Francisco, US", time: "May 17, 2026 · 3:42 PM", ip: "192.168.1.***" },
    variables: [
      { name: "device",   example: "Chrome on macOS",        desc: "Browser and OS" },
      { name: "location", example: "San Francisco, US",      desc: "Geographic location" },
      { name: "time",     example: "May 17, 2026 · 3:42 PM", desc: "Sign-in timestamp" },
      { name: "ip",       example: "192.168.1.***",           desc: "IP address" },
    ],
  },
  {
    key: "accountDeactivation", name: "Account Deactivation",
    description: "Sent when a user's account has been deactivated.",
    category: "Account",
    defaultSubject: "Your Eastape Studio account has been deactivated",
    sampleData: { reactivateUrl: "https://studio.eastape.com/reactivate?token=sample123" },
    variables: [{ name: "reactivateUrl", example: "https://studio.eastape.com/reactivate?token=…", desc: "Reactivation link (valid 30 days)" }],
  },
  {
    key: "paymentReceipt", name: "Payment Receipt",
    description: "Sent after a successful payment is processed.",
    category: "Billing",
    defaultSubject: "Payment confirmed — $12.00",
    sampleData: { amount: "$12.00", plan: "Pro Monthly", billingDate: "May 17, 2026", invoiceId: "INV-20260517", paymentMethod: "•••• 4242", invoiceUrl: "https://studio.eastape.com/billing" },
    variables: [
      { name: "amount",        example: "$12.00",          desc: "Payment amount" },
      { name: "plan",          example: "Pro Monthly",     desc: "Plan name" },
      { name: "billingDate",   example: "May 17, 2026",    desc: "Billing date" },
      { name: "invoiceId",     example: "INV-20260517",    desc: "Invoice ID" },
      { name: "paymentMethod", example: "•••• 4242",       desc: "Masked card number" },
      { name: "invoiceUrl",    example: "https://…",       desc: "Full invoice URL" },
    ],
  },
  {
    key: "custom", name: "Admin Base Template",
    description: "Base template used for admin-composed custom emails.",
    category: "Admin",
    defaultSubject: "{{subject}}",
    sampleData: { subject: "Important update", body: "Hi,\n\nWe have an important update regarding your account.\n\nPlease review the changes.", ctaText: "View Dashboard", ctaUrl: "https://studio.eastape.com/dashboard" },
    variables: [
      { name: "subject", example: "Important update",             desc: "Email subject (also shown as heading)" },
      { name: "body",    example: "Hello…",                       desc: "Body text (newlines → <br>)" },
      { name: "ctaText", example: "View Dashboard",               desc: "CTA button label (optional)" },
      { name: "ctaUrl",  example: "https://studio.eastape.com/…", desc: "CTA button URL (optional)" },
    ],
  },
];

const CAT_META = {
  Onboarding: { color: "#4ade80", bg: "rgba(74,222,128,0.12)",  icon: UserCircle },
  Auth:       { color: "#60a5fa", bg: "rgba(96,165,250,0.12)",   icon: ShieldCheck },
  Security:   { color: "#fbbf24", bg: "rgba(251,191,36,0.12)",   icon: Lightning },
  Account:    { color: "#f87171", bg: "rgba(248,113,113,0.12)",  icon: Warning },
  Billing:    { color: "#a855f7", bg: "rgba(168,85,247,0.12)",   icon: CreditCard },
  Admin:      { color: "#f97316", bg: "rgba(249,115,22,0.12)",   icon: Wrench },
};

/* ── Supabase auth templates (managed in Supabase dashboard) ─── */
const SUPABASE_TEMPLATES = [
  { name: "Confirm sign up",        desc: "Ask users to confirm their email after signing up",            token: "ConfirmationURL, Token, TokenHash, Email" },
  { name: "Invite user",            desc: "Invite users who don't yet have an account to sign up",        token: "ConfirmationURL, Token, TokenHash, Email" },
  { name: "Magic link",             desc: "Allow users to sign in via a one-time link",                   token: "ConfirmationURL, Token, TokenHash, Email" },
  { name: "Change email address",   desc: "Ask users to verify their new email address",                  token: "ConfirmationURL, Token, TokenHash, Email, NewEmail" },
  { name: "Reset password",         desc: "Allow users to reset their password if they forget it",        token: "ConfirmationURL, Token, TokenHash, Email" },
  { name: "Reauthentication",       desc: "Ask users to re-authenticate before a sensitive action",       token: "Token, Email" },
];

/* ── Small components ──────────────────────────────────────────── */
function Spin({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      style={{ animation: "spin .75s linear infinite", flexShrink: 0 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

function Toast({ msg, type = "success", onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3500); return () => clearTimeout(t); }, [onDone]);
  const c = type === "error" ? { bg: "rgba(248,113,113,0.15)", border: "rgba(248,113,113,0.3)", text: "#f87171" }
          : { bg: "rgba(74,222,128,0.12)", border: "rgba(74,222,128,0.25)", text: "#4ade80" };
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
      style={{ position: "fixed", bottom: 24, right: 24, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: "12px 16px", fontSize: 13, color: c.text, zIndex: 9999, display: "flex", alignItems: "center", gap: 8, maxWidth: 320, boxShadow: "0 8px 32px rgba(0,0,0,.4)" }}>
      <CheckCircle size={16} weight="bold" />{msg}
    </motion.div>
  );
}

function CatPill({ category }) {
  const m = CAT_META[category] || { color: "#94a3b8", bg: "rgba(100,116,139,0.12)" };
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: m.bg, color: m.color, letterSpacing: "0.04em", textTransform: "uppercase" }}>
      {category}
    </span>
  );
}

/* ── Template Editor Panel ─────────────────────────────────────── */
function TemplateEditor({ tmpl, onClose, onSaved }) {
  const [viewMode, setViewMode] = useState("source"); // "source" | "preview"
  const [subject, setSubject]   = useState(tmpl.defaultSubject);
  const [html, setHtml]         = useState("");
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [testing, setTesting]   = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [showTest, setShowTest] = useState(false);
  const [customized, setCustomized] = useState(false);
  const [copyState, setCopyState] = useState(false);

  // Load default preview HTML from edge function
  const loadPreview = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch("/send-email", {
        method: "POST",
        body: JSON.stringify({ template: tmpl.key, data: tmpl.sampleData, preview: true }),
      });
      setHtml(d.html || "");
      if (d.subject) setSubject(d.subject);
    } catch (err) {
      setHtml(`<p style="color:#f87171;font-family:sans-serif;padding:24px">Preview error: ${err.message}</p>`);
    } finally {
      setLoading(false);
    }
  }, [tmpl]);

  // Load saved template from DB on mount
  useEffect(() => {
    async function loadSaved() {
      try {
        const res = await fetch(
          `${SUPA_URL}/rest/v1/email_templates?key=eq.${tmpl.key}&is_active=eq.true&select=subject,html_body`,
          { headers: authHeaders() }
        );
        if (res.ok) {
          const rows = await res.json();
          if (rows?.length > 0) {
            setSubject(rows[0].subject || tmpl.defaultSubject);
            setHtml(rows[0].html_body || "");
            setCustomized(true);
            setLoading(false);
            return;
          }
        }
      } catch { /* table may not exist yet */ }
      loadPreview();
    }
    loadSaved();
  }, [tmpl, loadPreview]);

  async function handleSave() {
    setSaving(true);
    try {
      const { token, userId } = getAuth();
      const res = await fetch(`${SUPA_URL}/rest/v1/email_templates`, {
        method: "POST",
        headers: { ...authHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ key: tmpl.key, subject, html_body: html, is_active: true, updated_by: userId }),
      });
      if (!res.ok) throw new Error(await res.text());
      setCustomized(true);
      onSaved?.("Template saved — will be used on next send");
    } catch (err) {
      onSaved?.(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    try {
      await fetch(`${SUPA_URL}/rest/v1/email_templates?key=eq.${tmpl.key}`, {
        method: "DELETE", headers: authHeaders(),
      });
      setCustomized(false);
    } catch { /* ignore */ }
    loadPreview();
  }

  async function handleSendTest() {
    if (!testEmail) return;
    setTesting(true);
    try {
      await apiFetch("/send-email", {
        method: "POST",
        body: JSON.stringify({ to: testEmail, template: tmpl.key, data: tmpl.sampleData }),
      });
      onSaved?.(`Test email sent to ${testEmail}`);
      setShowTest(false);
    } catch (err) {
      onSaved?.(err.message, "error");
    } finally {
      setTesting(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(html);
    setCopyState(true);
    setTimeout(() => setCopyState(false), 1800);
  }

  const meta = CAT_META[tmpl.category] || {};

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: "var(--t1)" }}>{tmpl.name}</span>
              <CatPill category={tmpl.category} />
              {customized && (
                <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "rgba(249,115,22,0.12)", color: "#f97316" }}>Custom</span>
              )}
            </div>
            <p style={{ fontSize: 12, color: "var(--t3)", margin: 0 }}>{tmpl.description}</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", padding: 4, display: "flex" }}>
            <X size={18} />
          </button>
        </div>

        {/* Subject */}
        <div style={{ marginTop: 14 }}>
          <label style={{ fontSize: 11, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, display: "block", marginBottom: 6 }}>Subject</label>
          <input
            value={subject} onChange={e => setSubject(e.target.value)}
            style={{ width: "100%", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", color: "var(--t1)", fontSize: 13, outline: "none", boxSizing: "border-box" }}
          />
        </div>
      </div>

      {/* Source / Preview toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 24px", borderBottom: "1px solid var(--border)", flexShrink: 0, background: "var(--bg)" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {["source", "preview"].map(v => (
            <button key={v} onClick={() => setViewMode(v)}
              style={{ padding: "5px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                background: viewMode === v ? "var(--card)" : "none",
                color: viewMode === v ? "var(--t1)" : "var(--t3)",
                transition: "all .15s" }}>
              {v === "source" ? <><Code size={13} style={{ marginRight: 5 }} />Source</> : <><Eye size={13} style={{ marginRight: 5 }} />Preview</>}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {viewMode === "source" && (
            <button onClick={handleCopy} className="admin-action-btn" style={{ fontSize: 12, gap: 5 }}>
              {copyState ? <><Check size={13} />Copied</> : <><Copy size={13} />Copy HTML</>}
            </button>
          )}
          <button onClick={() => { setShowTest(v => !v); }} className="admin-action-btn" style={{ fontSize: 12, gap: 5 }}>
            <PaperPlane size={13} />Send test
          </button>
        </div>
      </div>

      {/* Send test row */}
      <AnimatePresence>
        {showTest && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            style={{ overflow: "hidden", flexShrink: 0 }}>
            <div style={{ padding: "10px 24px", background: "rgba(249,115,22,0.05)", borderBottom: "1px solid var(--border)", display: "flex", gap: 8 }}>
              <input value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="recipient@example.com"
                style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 12px", color: "var(--t1)", fontSize: 13, outline: "none" }} />
              <button onClick={handleSendTest} disabled={testing || !testEmail} className="admin-action-btn primary" style={{ minWidth: 80, justifyContent: "center", fontSize: 12 }}>
                {testing ? <Spin size={13} /> : "Send"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Body */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", gap: 10, color: "var(--t3)", fontSize: 13 }}>
            <Spin />Loading preview…
          </div>
        ) : viewMode === "source" ? (
          <textarea
            value={html} onChange={e => setHtml(e.target.value)}
            spellCheck={false}
            style={{
              width: "100%", height: "100%", background: "#0a0a0d", color: "#a8d8a8",
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: 12, lineHeight: 1.7,
              border: "none", outline: "none", padding: "20px 24px", boxSizing: "border-box",
              resize: "none", tabSize: 2,
            }}
          />
        ) : (
          <iframe
            srcDoc={html}
            sandbox="allow-same-origin"
            style={{ width: "100%", height: "100%", border: "none", background: "#08080a" }}
            title="Email preview"
          />
        )}
      </div>

      {/* Variables */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "12px 24px", flexShrink: 0, background: "var(--bg)" }}>
        <div style={{ fontSize: 11, color: "var(--t4)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 8 }}>Available variables</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px" }}>
          {tmpl.variables.map(v => (
            <span key={v.name} title={v.desc}
              style={{ fontSize: 12, fontFamily: "monospace", color: "#a855f7", background: "rgba(168,85,247,0.08)", padding: "2px 8px", borderRadius: 6, border: "1px solid rgba(168,85,247,0.15)", cursor: "default" }}>
              {"{{"}{v.name}{"}}"}
            </span>
          ))}
        </div>
      </div>

      {/* Footer actions */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <button onClick={handleReset} className="admin-action-btn" style={{ fontSize: 12, gap: 5, color: "var(--t3)" }}>
          <ArrowCounterClockwise size={13} />Reset to default
        </button>
        <button onClick={handleSave} disabled={saving} className="admin-action-btn primary" style={{ minWidth: 110, justifyContent: "center", fontSize: 13 }}>
          {saving ? <><Spin size={13} />Saving…</> : <><FloppyDisk size={14} />Save changes</>}
        </button>
      </div>
    </div>
  );
}

/* ── Templates Tab ─────────────────────────────────────────────── */
function TemplatesTab({ onToast }) {
  const [selected, setSelected] = useState(null);

  const byCategory = TEMPLATE_DEFS.reduce((acc, t) => {
    (acc[t.category] = acc[t.category] || []).push(t);
    return acc;
  }, {});

  return (
    <div style={{ display: "flex", height: "calc(100vh - 160px)", minHeight: 500 }}>
      {/* Left: list */}
      <div style={{ width: 340, flexShrink: 0, borderRight: "1px solid var(--border)", overflowY: "auto", background: "var(--bg)" }}>
        {/* Transactional templates */}
        <div style={{ padding: "16px 20px 8px" }}>
          <div style={{ fontSize: 11, color: "var(--t4)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 12 }}>Transactional</div>
        </div>
        {TEMPLATE_DEFS.map(tmpl => {
          const meta = CAT_META[tmpl.category] || {};
          const Ico = meta.icon || Envelope;
          const active = selected?.key === tmpl.key;
          return (
            <button key={tmpl.key} onClick={() => setSelected(active ? null : tmpl)}
              style={{
                width: "100%", background: active ? "var(--card)" : "none", border: "none",
                borderLeft: `2px solid ${active ? "var(--admin-accent)" : "transparent"}`,
                padding: "12px 20px", cursor: "pointer", textAlign: "left",
                display: "flex", alignItems: "flex-start", gap: 12, transition: "all .15s",
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--hover)"; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = "none"; }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: active ? meta.bg : "var(--card)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .15s" }}>
                <Ico size={15} style={{ color: active ? meta.color : "var(--t3)" }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: active ? "var(--t1)" : "var(--t2)", marginBottom: 2 }}>{tmpl.name}</div>
                <div style={{ fontSize: 11, color: "var(--t4)", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tmpl.description}</div>
              </div>
              <CaretRight size={14} style={{ color: "var(--t4)", flexShrink: 0, marginLeft: "auto", marginTop: 4 }} />
            </button>
          );
        })}

        {/* Supabase Auth templates */}
        <div style={{ padding: "20px 20px 8px", marginTop: 8, borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: 11, color: "var(--t4)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 4 }}>Authentication</div>
          <div style={{ fontSize: 11, color: "var(--t4)", marginBottom: 12, lineHeight: 1.5 }}>Managed in Supabase dashboard</div>
        </div>
        {SUPABASE_TEMPLATES.map(t => (
          <a key={t.name}
            href={`https://supabase.com/dashboard/project/${SUPA_URL?.split("//")[1]?.split(".")[0]}/auth/templates`}
            target="_blank" rel="noreferrer"
            style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 20px", textDecoration: "none", opacity: 0.7, transition: "opacity .15s" }}
            onMouseEnter={e => e.currentTarget.style.opacity = "1"}
            onMouseLeave={e => e.currentTarget.style.opacity = "0.7"}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--card)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <ShieldCheck size={15} style={{ color: "var(--t4)" }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--t2)", marginBottom: 2 }}>{t.name}</div>
              <div style={{ fontSize: 11, color: "var(--t4)", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.desc}</div>
            </div>
            <ArrowSquareOut size={13} style={{ color: "var(--t4)", flexShrink: 0, marginLeft: "auto", marginTop: 4 }} />
          </a>
        ))}
      </div>

      {/* Right: editor */}
      <div style={{ flex: 1, overflow: "hidden", background: "var(--card)" }}>
        <AnimatePresence mode="wait">
          {selected ? (
            <motion.div key={selected.key} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }} style={{ height: "100%", display: "flex", flexDirection: "column" }}>
              <TemplateEditor tmpl={selected} onClose={() => setSelected(null)}
                onSaved={(msg, type) => onToast(msg, type)} />
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, color: "var(--t4)" }}>
              <Envelope size={40} weight="thin" />
              <div style={{ fontSize: 14, color: "var(--t3)" }}>Select a template to view or edit</div>
              <div style={{ fontSize: 12, color: "var(--t4)", textAlign: "center", maxWidth: 300, lineHeight: 1.6 }}>
                Customized templates override the default code-based templates when emails are sent.
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ── Logs Tab ──────────────────────────────────────────────────── */
function LogsTab() {
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(1);
  const [total, setTotal]     = useState(0);
  const PER = 30;

  async function load(p = 1) {
    setLoading(true);
    try {
      const offset = (p - 1) * PER;
      // Query audit logs for email-related actions
      const res = await fetch(
        `${SUPA_URL}/rest/v1/admin_audit_logs?action=in.(email_sent,send_email,custom_email)&order=created_at.desc&limit=${PER}&offset=${offset}&select=id,action,metadata,created_at,admin_id`,
        { headers: authHeaders() }
      );
      const cRange = res.headers.get("content-range");
      if (cRange) setTotal(parseInt(cRange.split("/")[1] || "0"));
      const d = await res.json();
      setLogs(Array.isArray(d) ? d : []);
    } catch { setLogs([]); }
    setLoading(false);
  }

  useEffect(() => { load(page); }, [page]);

  function fmt(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
  }

  async function handleExport() {
    const res = await fetch(`${SUPA_URL}/rest/v1/admin_audit_logs?action=in.(email_sent,send_email,custom_email)&order=created_at.desc&limit=1000&select=id,action,metadata,created_at`, { headers: authHeaders() });
    const d = await res.json();
    const csv = ["ID,Action,To,Subject,Date", ...d.map(r => [r.id, r.action, r.metadata?.to || "", r.metadata?.subject || "", r.created_at].join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "email-logs.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const totalPages = Math.max(1, Math.ceil(total / PER));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "var(--t3)" }}>{total > 0 ? `${total.toLocaleString()} email log entries` : "Email send logs"}</div>
        <button className="admin-action-btn" onClick={handleExport} style={{ fontSize: 12, gap: 5 }}>
          <DownloadSimple size={13} />Export CSV
        </button>
      </div>
      <div className="admin-table-wrap" style={{ padding: 0 }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Template</th>
              <th>Recipient</th>
              <th>Subject</th>
              <th>Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>{[1,2,3,4,5].map(c => <td key={c}><div style={{ height: 14, borderRadius: 6, background: "var(--border)", width: `${40 + (i*7+c*9)%45}%` }} /></td>)}</tr>
              ))
            ) : logs.length === 0 ? (
              <tr><td colSpan={5}>
                <div className="admin-empty"><Envelope size={28} style={{ color: "var(--t3)" }} /><span>No email logs found.</span></div>
              </td></tr>
            ) : logs.map(log => (
              <tr key={log.id}>
                <td>
                  <span style={{ fontSize: 12, fontFamily: "monospace", color: "var(--admin-accent)", background: "rgba(249,115,22,0.08)", padding: "2px 8px", borderRadius: 6 }}>
                    {log.metadata?.template || log.action}
                  </span>
                </td>
                <td style={{ fontSize: 12, color: "var(--t2)" }}>{log.metadata?.to || "—"}</td>
                <td style={{ fontSize: 12, color: "var(--t2)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.metadata?.subject || "—"}</td>
                <td style={{ fontSize: 12, color: "var(--t3)", whiteSpace: "nowrap" }}>{fmt(log.created_at)}</td>
                <td>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "rgba(74,222,128,0.1)", color: "#4ade80" }}>Sent</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && totalPages > 1 && (
          <div className="admin-pagination">
            <span style={{ fontSize: 12, color: "var(--t3)" }}>Page {page} of {totalPages}</span>
            <div style={{ display: "flex", gap: 4 }}>
              <button className="admin-page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
              <button className="admin-page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Compose Tab ───────────────────────────────────────────────── */
function ComposeTab({ onToast }) {
  const [to, setTo]           = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody]       = useState("");
  const [ctaText, setCtaText] = useState("");
  const [ctaUrl, setCtaUrl]   = useState("");
  const [sending, setSending] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [viewMode, setViewMode] = useState("compose"); // "compose" | "preview"
  const [prevLoading, setPrevLoading] = useState(false);

  async function loadPreview() {
    if (!subject && !body) return;
    setPrevLoading(true);
    try {
      const d = await apiFetch("/send-email", {
        method: "POST",
        body: JSON.stringify({ template: "custom", data: { subject, body, ctaText: ctaText || undefined, ctaUrl: ctaUrl || undefined }, preview: true }),
      });
      setPreviewHtml(d.html || "");
    } catch { setPreviewHtml(""); }
    setPrevLoading(false);
  }

  async function handleSend() {
    if (!to || !subject || !body) return;
    setSending(true);
    try {
      const emails = to.split(",").map(e => e.trim()).filter(Boolean);
      await apiFetch("/send-email", {
        method: "POST",
        body: JSON.stringify({
          to: emails.length === 1 ? emails[0] : emails,
          template: "custom",
          data: { subject, body, ctaText: ctaText || undefined, ctaUrl: ctaUrl || undefined },
        }),
      });
      onToast(`Email sent to ${emails.join(", ")}`);
      setTo(""); setSubject(""); setBody(""); setCtaText(""); setCtaUrl(""); setPreviewHtml("");
    } catch (err) { onToast(err.message, "error"); }
    setSending(false);
  }

  const inputStyle = { width: "100%", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", color: "var(--t1)", fontSize: 13, outline: "none", boxSizing: "border-box" };
  const labelStyle = { fontSize: 11, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, display: "block", marginBottom: 6 };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>
      {/* Left: compose form */}
      <div className="admin-table-wrap" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--t1)", marginBottom: 4 }}>Compose Email</div>

        <div>
          <label style={labelStyle}>To (email or comma-separated)</label>
          <input style={inputStyle} value={to} onChange={e => setTo(e.target.value)} placeholder="user@example.com, another@example.com" />
        </div>
        <div>
          <label style={labelStyle}>Subject</label>
          <input style={inputStyle} value={subject} onChange={e => setSubject(e.target.value)} placeholder="Your subject line…" />
        </div>
        <div>
          <label style={labelStyle}>Body</label>
          <textarea style={{ ...inputStyle, minHeight: 180, resize: "vertical", lineHeight: 1.65 }} value={body} onChange={e => setBody(e.target.value)} placeholder="Write your message here…" />
        </div>

        <div style={{ padding: "14px 16px", background: "var(--bg)", borderRadius: 8, border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 12, color: "var(--t3)", fontWeight: 500 }}>Optional CTA Button</div>
          <div>
            <label style={{ ...labelStyle, marginBottom: 4 }}>Button Label</label>
            <input style={inputStyle} value={ctaText} onChange={e => setCtaText(e.target.value)} placeholder="e.g. View Dashboard" />
          </div>
          <div>
            <label style={{ ...labelStyle, marginBottom: 4 }}>Button URL</label>
            <input style={inputStyle} value={ctaUrl} onChange={e => setCtaUrl(e.target.value)} placeholder="https://studio.eastape.com/…" />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
          <button onClick={() => { setViewMode("preview"); loadPreview(); }} className="admin-action-btn" style={{ flex: 1, justifyContent: "center", gap: 6 }}>
            <Eye size={13} />Preview
          </button>
          <button onClick={handleSend} disabled={sending || !to || !subject || !body} className="admin-action-btn primary"
            style={{ flex: 2, justifyContent: "center", gap: 6, opacity: !to || !subject || !body ? 0.5 : 1 }}>
            {sending ? <><Spin size={13} />Sending…</> : <><PaperPlane size={14} />Send Email</>}
          </button>
        </div>
      </div>

      {/* Right: preview */}
      <div className="admin-table-wrap" style={{ padding: 0, overflow: "hidden", minHeight: 400 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--t2)" }}>Email Preview</span>
          {previewHtml && (
            <div style={{ display: "flex", gap: 4 }}>
              {["compose", "preview"].map(v => (
                <button key={v} onClick={() => { setViewMode(v); if (v === "preview") loadPreview(); }}
                  style={{ padding: "4px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
                    background: viewMode === v ? "var(--card)" : "none", color: viewMode === v ? "var(--t1)" : "var(--t3)" }}>
                  {v === "compose" ? "Source" : "Preview"}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ height: 500 }}>
          {prevLoading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", gap: 10, color: "var(--t3)", fontSize: 13 }}>
              <Spin />Rendering…
            </div>
          ) : previewHtml ? (
            viewMode === "preview" ? (
              <iframe srcDoc={previewHtml} sandbox="allow-same-origin" style={{ width: "100%", height: "100%", border: "none" }} />
            ) : (
              <textarea readOnly value={previewHtml} style={{ width: "100%", height: "100%", background: "#0a0a0d", color: "#a8d8a8", fontFamily: "monospace", fontSize: 11, lineHeight: 1.6, border: "none", outline: "none", padding: 20, boxSizing: "border-box", resize: "none" }} />
            )
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10, color: "var(--t4)" }}>
              <Eye size={32} weight="thin" />
              <span style={{ fontSize: 13, color: "var(--t3)" }}>Fill in the form and click Preview</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────────── */
export default function AdminEmails() {
  const [tab, setTab]     = useState("templates");
  const [toast, setToast] = useState(null);

  function showToast(msg, type = "success") { setToast({ msg, type, id: Date.now() }); }

  const TABS = [
    { id: "templates", label: "Templates",    icon: <Code size={14} /> },
    { id: "logs",      label: "Logs",         icon: <ClockCounterClockwise size={14} /> },
    { id: "compose",   label: "Compose",      icon: <PaperPlane size={14} /> },
  ];

  return (
    <div style={{ position: "relative" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div className="admin-page-title">Emails</div>
        <div className="admin-page-sub">Configure email templates, track sends, and compose custom messages.</div>
      </div>

      {/* Tab nav */}
      <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--border)", marginBottom: 24 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              display: "flex", alignItems: "center", gap: 7, padding: "9px 16px",
              background: "none", border: "none", cursor: "pointer", fontSize: 13,
              fontWeight: tab === t.id ? 600 : 400,
              color: tab === t.id ? "var(--t1)" : "var(--t3)",
              borderBottom: `2px solid ${tab === t.id ? "var(--admin-accent)" : "transparent"}`,
              marginBottom: -1, transition: "all .15s",
            }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          {tab === "templates" && <TemplatesTab onToast={showToast} />}
          {tab === "logs"      && <LogsTab />}
          {tab === "compose"   && <ComposeTab onToast={showToast} />}
        </motion.div>
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && <Toast key={toast.id} msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
      </AnimatePresence>
    </div>
  );
}
