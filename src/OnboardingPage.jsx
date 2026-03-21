import React, { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Check, CaretDown, FilmSlate, CloudArrowUp, UserPlus, SquaresFour } from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";
import { userApi } from "./lib/api";

/* ── Custom dropdown (avoids white native select popup) ── */
function CustomSelect({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onDown(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "var(--input-bg, rgba(255,255,255,0.06))", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "var(--r, 10px)", padding: "10px 14px", color: value ? "var(--t1)" : "var(--t3)",
          fontSize: 14, cursor: "pointer", textAlign: "left",
        }}
      >
        {value || placeholder}
        <CaretDown size={14} style={{ opacity: 0.5, transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "none", flexShrink: 0 }} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scaleY: 0.95 }} animate={{ opacity: 1, y: 0, scaleY: 1 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            style={{
              position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 50,
              background: "#16162a", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12, overflow: "hidden auto", maxHeight: 280,
              boxShadow: "0 16px 40px rgba(0,0,0,0.6)", transformOrigin: "top",
            }}
          >
            {options.map((opt, i) => (
              <button
                key={opt} type="button"
                onClick={() => { onChange(opt); setOpen(false); }}
                style={{
                  width: "100%", textAlign: "left", padding: "11px 16px", fontSize: 14,
                  background: value === opt ? "rgba(124,58,237,0.25)" : "transparent",
                  color: value === opt ? "#c4b5fd" : "var(--t2)",
                  borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none",
                  border: "none", borderTop: i > 0 ? "1px solid rgba(255,255,255,0.04)" : "none",
                  cursor: "pointer", display: "block", transition: "background 0.1s",
                  fontWeight: value === opt ? 600 : 400,
                }}
                onMouseEnter={e => { if (value !== opt) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                onMouseLeave={e => { if (value !== opt) e.currentTarget.style.background = "transparent"; }}
              >
                {opt}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Suggestion generator ── */
function generateSuggestions(fullName) {
  if (!fullName) return [];
  const clean = fullName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const parts = fullName.toLowerCase().split(" ").map(p => p.replace(/[^a-z0-9]/g, "")).filter(Boolean);
  const candidates = [
    parts.join(""),
    parts.join("_"),
    parts[0],
    parts[0] + (parts[1]?.[0] || ""),
    clean + "_films",
    clean + "_studio",
  ].filter(s => s && s.length >= 3 && s.length <= 20);
  return [...new Set(candidates)];
}

const USERNAME_RE = /^[a-z0-9_-]{3,20}$/;

const ROLES = [
  "Director", "Producer", "Cinematographer", "Editor", "VFX Artist",
  "Colorist", "Motion Designer", "Sound Designer", "Photographer",
  "Project Manager", "Other",
];

const slideVariants = {
  enter: dir => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] } },
  exit:  dir => ({ x: dir > 0 ? -40 : 40, opacity: 0, transition: { duration: 0.18 } }),
};

/* ── Step Indicator ── */
function StepIndicator({ current }) {
  const steps = ["Username", "About You", "Get Started"];
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: 36 }}>
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <React.Fragment key={n}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <motion.div
                animate={{
                  background: done || active ? "#7c3aed" : "transparent",
                  borderColor: done || active ? "#7c3aed" : "rgba(255,255,255,0.2)",
                }}
                transition={{ duration: 0.25 }}
                style={{
                  width: 30, height: 30, borderRadius: "50%",
                  border: "2px solid", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 700, color: "#fff",
                }}
              >
                {done ? <Check size={13} weight="bold" /> : n}
              </motion.div>
              <span style={{ fontSize: 11, color: active ? "var(--t2)" : "var(--t3)", whiteSpace: "nowrap" }}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <motion.div
                animate={{ background: done ? "#7c3aed" : "rgba(255,255,255,0.1)" }}
                transition={{ duration: 0.25 }}
                style={{ width: 56, height: 2, margin: "0 4px", marginBottom: 22, flexShrink: 0 }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ── Action Card ── */
function ActionCard({ icon, title, description, onClick, accent }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.02, borderColor: "rgba(255,255,255,0.18)" }}
      whileTap={{ scale: 0.98 }}
      style={{
        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 14, padding: "20px 18px", cursor: "pointer", textAlign: "left",
        display: "flex", flexDirection: "column", gap: 10, width: "100%",
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
        background: accent || "rgba(124,58,237,0.15)",
      }}>
        {icon}
      </div>
      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--t1)" }}>{title}</span>
      <span style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.4 }}>{description}</span>
    </motion.button>
  );
}

/* ════════════════════════════════════════════ */
export default function OnboardingPage() {
  const { user, loading: authLoading, profile, updateProfileLocally } = useAuth();
  const navigate = useNavigate();

  const [currentStep, setCurrentStep] = useState(1);
  const [dir, setDir] = useState(1);

  // Step 1
  const [username, setUsername]       = useState("");
  const [usernameStatus, setUStatus]  = useState(null);
  const [unameMsg, setUnameMsg]       = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [step1Error, setStep1Error]   = useState("");
  const debounceRef = useRef(null);

  // Step 2
  const [role, setRole]       = useState("");
  const [company, setCompany] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Auth guard ──
  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/login", { replace: true }); return; }
  }, [user, authLoading]);

  // ── Redirect if already completed ──
  useEffect(() => {
    if (profile?.onboarding_completed) navigate("/", { replace: true });
  }, [profile]);

  // ── Pre-fill company from profile ──
  useEffect(() => {
    if (profile?.company) setCompany(profile.company);
    if (profile?.username) {
      setUsername(profile.username);
      setUStatus("available");
    }
  }, [profile]);

  // ── Generate + check username suggestions ──
  useEffect(() => {
    if (!user) return;
    const name = profile?.name || user?.user_metadata?.full_name || "";
    if (!name) return;
    const candidates = generateSuggestions(name);
    if (!candidates.length) return;

    Promise.all(
      candidates.map(u => userApi.checkUsername(u).then(r => r.available ? u : null).catch(() => null))
    ).then(results => {
      setSuggestions(results.filter(Boolean).slice(0, 4));
    });
  }, [profile, user]);

  // ── Username debounce check ──
  useEffect(() => {
    clearTimeout(debounceRef.current);
    setStep1Error("");
    if (!username) { setUStatus(null); setUnameMsg(""); return; }
    if (!USERNAME_RE.test(username)) {
      setUStatus("invalid"); setUnameMsg("3–20 chars: letters, numbers, _ or - only."); return;
    }
    // Don't re-check if it's the same as what's already saved
    if (username === profile?.username) { setUStatus("available"); setUnameMsg(""); return; }
    setUStatus("checking"); setUnameMsg("");
    debounceRef.current = setTimeout(() => {
      userApi.checkUsername(username).then(res => {
        setUStatus(res.available ? "available" : res.reason);
        setUnameMsg(res.available ? "Available!" : res.reason === "taken" ? "Already taken." : res.reason === "reserved" ? "Not available." : "Invalid format.");
      }).catch(() => setUStatus(null));
    }, 600);
    return () => clearTimeout(debounceRef.current);
  }, [username]);

  function goTo(step) { setDir(step > currentStep ? 1 : -1); setCurrentStep(step); }

  /* ── Step 1: save username ── */
  async function handleStep1Continue() {
    setIsSubmitting(true);
    setStep1Error("");
    try {
      if (username && username !== profile?.username) {
        await userApi.updateProfile({ username });
        updateProfileLocally({ username, onboarding_step: 2 });
      }
      await userApi.updateProfile({ onboarding_step: 2 });
      goTo(2);
    } catch (err) {
      setStep1Error(err.message || "Could not save username.");
    } finally { setIsSubmitting(false); }
  }

  async function handleStep1Skip() {
    await userApi.updateProfile({ onboarding_step: 2 }).catch(() => {});
    updateProfileLocally({ onboarding_step: 2 });
    goTo(2);
  }

  /* ── Step 2: save role + company ── */
  async function handleStep2Continue() {
    setIsSubmitting(true);
    try {
      await userApi.updateProfile({ role: role || null, company, onboarding_step: 3 });
      updateProfileLocally({ role, company, onboarding_step: 3 });
      goTo(3);
    } catch { goTo(3); }
    finally { setIsSubmitting(false); }
  }

  /* ── Step 3: mark complete + navigate ── */
  async function markDone(path) {
    try {
      await userApi.updateProfile({ onboarding_completed: true, onboarding_step: 3 });
      updateProfileLocally({ onboarding_completed: true, onboarding_step: 3 });
    } catch {}
    navigate(path);
  }

  if (authLoading) return null;

  const displayName = profile?.name || user?.user_metadata?.full_name || "";
  const uname = profile?.username || username;

  const statusColor = {
    available: "#22c55e", taken: "#ef4444", invalid: "#f59e0b",
    reserved: "#ef4444", checking: "var(--t3)",
  }[usernameStatus] || "var(--t3)";

  const canContinueStep1 = !username || usernameStatus === "available" || username === profile?.username;

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 24px" }}>
      {/* Logo */}
      <Link to="/" style={{ marginBottom: 40 }}>
        <img src="/logo.png" alt="Eastape" style={{ height: 36 }} onError={e => { e.target.style.display = "none"; }} />
      </Link>

      {/* Card */}
      <div style={{ width: "100%", maxWidth: 520 }}>
        <StepIndicator current={currentStep} />

        <div style={{ position: "relative", overflow: "hidden" }}>
          <AnimatePresence mode="wait" custom={dir}>
            {/* ─────────── STEP 1 ─────────── */}
            {currentStep === 1 && (
              <motion.div key="step1" custom={dir} variants={slideVariants} initial="enter" animate="center" exit="exit">
                <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Choose your @username</h2>
                <p style={{ fontSize: 14, color: "var(--t3)", marginBottom: 24 }}>How teammates will find and mention you</p>

                {/* Username input */}
                <div style={{ position: "relative", marginBottom: 6 }}>
                  <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#7c3aed", fontSize: 14, fontWeight: 700, zIndex: 1 }}>@</span>
                  <input
                    className="form-input"
                    style={{ paddingLeft: 30, paddingRight: 80, width: "100%", boxSizing: "border-box" }}
                    placeholder="yourname"
                    value={username}
                    maxLength={20}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                  />
                  <span style={{ position: "absolute", right: 44, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "var(--t3)" }}>{username.length}/20</span>
                  {usernameStatus && usernameStatus !== "checking" && (
                    <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: statusColor }}>
                      {usernameStatus === "available" ? "✓" : "✗"}
                    </span>
                  )}
                  {usernameStatus === "checking" && (
                    <span className="spinner" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", width: 14, height: 14 }} />
                  )}
                </div>

                {/* Status message */}
                {(unameMsg || step1Error) && (
                  <p style={{ fontSize: 12, color: step1Error ? "#ef4444" : statusColor, marginBottom: 8 }}>
                    {step1Error || unameMsg}
                  </p>
                )}

                {/* Character hint */}
                <p style={{ fontSize: 11, color: "var(--t3)", marginBottom: 16 }}>
                  Lowercase letters, numbers, _ and - only.
                </p>

                {/* Suggestions */}
                {suggestions.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <span style={{ fontSize: 11, color: "var(--t3)", marginRight: 8 }}>Suggestions:</span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                      {suggestions.map(s => (
                        <button
                          key={s}
                          onClick={() => { setUsername(s); setUStatus("available"); setUnameMsg("Available!"); }}
                          style={{
                            background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)",
                            borderRadius: 999, padding: "4px 12px", fontSize: 12, color: "#a78bfa",
                            cursor: "pointer",
                          }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                  <button
                    className="btn-ghost"
                    style={{ fontSize: 13, color: "var(--t3)" }}
                    onClick={handleStep1Skip}
                    disabled={isSubmitting}
                  >
                    Skip
                  </button>
                  <button
                    className="btn-primary"
                    onClick={handleStep1Continue}
                    disabled={isSubmitting || !canContinueStep1 || usernameStatus === "checking"}
                  >
                    {isSubmitting ? <><span className="spinner" /> Saving…</> : "Continue →"}
                  </button>
                </div>
              </motion.div>
            )}

            {/* ─────────── STEP 2 ─────────── */}
            {currentStep === 2 && (
              <motion.div key="step2" custom={dir} variants={slideVariants} initial="enter" animate="center" exit="exit">
                <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Tell us about yourself</h2>
                <p style={{ fontSize: 14, color: "var(--t3)", marginBottom: 24 }}>Helps your team know who you are</p>

                {/* Role */}
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label className="form-label" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Your Role</label>
                  <CustomSelect
                    value={role}
                    onChange={setRole}
                    options={ROLES}
                    placeholder="— Select your role —"
                  />
                </div>

                {/* Company */}
                <div className="form-group" style={{ marginBottom: 28 }}>
                  <label className="form-label" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Company / Organisation</label>
                  <div className="form-input-wrap">
                    <input
                      className="form-input"
                      placeholder="Your company name (optional)"
                      value={company}
                      onChange={e => setCompany(e.target.value)}
                      maxLength={120}
                    />
                  </div>
                </div>

                {/* Footer */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <button className="btn-ghost" onClick={() => goTo(1)} style={{ fontSize: 13 }}>← Back</button>
                  <button className="btn-primary" onClick={handleStep2Continue} disabled={isSubmitting}>
                    {isSubmitting ? <><span className="spinner" /> Saving…</> : "Continue →"}
                  </button>
                </div>
              </motion.div>
            )}

            {/* ─────────── STEP 3 ─────────── */}
            {currentStep === 3 && (
              <motion.div key="step3" custom={dir} variants={slideVariants} initial="enter" animate="center" exit="exit">
                <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>You're all set! 🎉</h2>
                <p style={{ fontSize: 14, color: "var(--t2)", marginBottom: 4 }}>
                  {uname ? `Welcome to Eastape, @${uname}!` : `Welcome to Eastape${displayName ? `, ${displayName.split(" ")[0]}` : ""}!`}
                </p>
                <p style={{ fontSize: 14, color: "var(--t3)", marginBottom: 28 }}>What would you like to do first?</p>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <ActionCard
                    icon={<FilmSlate size={22} weight="duotone" color="#a78bfa" />}
                    accent="rgba(124,58,237,0.18)"
                    title="Create a Project" description="Start organizing your work"
                    onClick={() => markDone("/projects?new=1")}
                  />
                  <ActionCard
                    icon={<CloudArrowUp size={22} weight="duotone" color="#60a5fa" />}
                    accent="rgba(59,130,246,0.18)"
                    title="Upload Files" description="Add your footage to Drive"
                    onClick={() => markDone("/drive")}
                  />
                  <ActionCard
                    icon={<UserPlus size={22} weight="duotone" color="#34d399" />}
                    accent="rgba(16,185,129,0.18)"
                    title="Invite Team" description="Collaborate with others"
                    onClick={() => markDone("/projects")}
                  />
                  <ActionCard
                    icon={<SquaresFour size={22} weight="duotone" color="#fb923c" />}
                    accent="rgba(249,115,22,0.18)"
                    title="Explore Dashboard" description="See everything in one place"
                    onClick={() => markDone("/")}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
