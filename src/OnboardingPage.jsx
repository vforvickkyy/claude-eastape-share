import React, { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Check, CaretDown } from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";
import { userApi } from "./lib/api";

/* ── Combobox ── */
function RoleCombobox({ value, onChange, options, placeholder }) {
  const [query, setQuery]   = useState(value || "");
  const [open, setOpen]     = useState(false);
  const [rect, setRect]     = useState(null);
  const ref     = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { if (!value) setQuery(""); }, [value]);
  useEffect(() => {
    function onDown(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);
  useEffect(() => {
    if (open && inputRef.current) {
      const r = inputRef.current.getBoundingClientRect();
      setRect({ top: r.bottom + 4, left: r.left, width: r.width });
    }
  }, [open]);

  const filtered = query.trim() ? options.filter(o => o.toLowerCase().includes(query.toLowerCase())) : options;
  const showCustom = query.trim() && !options.some(o => o.toLowerCase() === query.toLowerCase());

  function select(opt) { setQuery(opt); onChange(opt); setOpen(false); }
  function handleInput(e) { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <input
          ref={inputRef}
          className="auth-v3-input"
          style={{ width: "100%", boxSizing: "border-box", paddingRight: 36 }}
          placeholder={placeholder}
          value={query}
          onChange={handleInput}
          onFocus={() => setOpen(true)}
          autoComplete="off"
        />
        <CaretDown
          size={13} onClick={() => { setOpen(o => !o); inputRef.current?.focus(); }}
          style={{
            position: "absolute", right: 12, top: "50%",
            transform: open ? "translateY(-50%) rotate(180deg)" : "translateY(-50%)",
            opacity: 0.4, cursor: "pointer", transition: "transform 0.15s",
          }}
        />
      </div>
      <AnimatePresence>
        {open && rect && (filtered.length > 0 || showCustom) && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            style={{
              position: "fixed", top: rect.top, left: rect.left, width: rect.width, zIndex: 9999,
              background: "var(--panel)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
            }}
          >
            {filtered.map((opt, i) => (
              <button key={opt} type="button" onMouseDown={e => { e.preventDefault(); select(opt); }}
                style={{
                  width: "100%", textAlign: "left", padding: "10px 14px", fontSize: 13.5,
                  background: value === opt ? "rgba(var(--accent-rgb,200,150,50),0.15)" : "transparent",
                  color: value === opt ? "var(--accent)" : "var(--t1)",
                  borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none",
                  border: "none", cursor: "pointer", fontWeight: value === opt ? 600 : 400,
                }}
                onMouseEnter={e => { if (value !== opt) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                onMouseLeave={e => { if (value !== opt) e.currentTarget.style.background = "transparent"; }}
              >{opt}</button>
            ))}
            {showCustom && (
              <button type="button" onMouseDown={e => { e.preventDefault(); select(query.trim()); }}
                style={{
                  width: "100%", textAlign: "left", padding: "10px 14px", fontSize: 12.5,
                  background: "transparent", color: "var(--t3)",
                  borderTop: filtered.length > 0 ? "1px solid rgba(255,255,255,0.08)" : "none",
                  border: "none", cursor: "pointer", fontStyle: "italic",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >Use "{query.trim()}"</button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function generateSuggestions(fullName) {
  if (!fullName) return [];
  const clean = fullName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const parts = fullName.toLowerCase().split(" ").map(p => p.replace(/[^a-z0-9]/g, "")).filter(Boolean);
  const candidates = [
    parts.join(""), parts.join("_"), parts[0],
    parts[0] + (parts[1]?.[0] || ""), clean + "_films", clean + "_studio",
  ].filter(s => s && s.length >= 3 && s.length <= 20);
  return [...new Set(candidates)];
}

const USERNAME_RE = /^[a-z0-9_-]{3,20}$/;
const ROLES = [
  "Director", "Producer", "Cinematographer", "Editor", "VFX Artist",
  "Colorist", "Motion Designer", "Sound Designer", "Photographer",
  "Project Manager", "Other",
];

const PROJECT_TYPES = [
  { id: "commercial",   label: "Commercial",    emoji: "📺", recommended: false },
  { id: "documentary",  label: "Documentary",   emoji: "🎥", recommended: true  },
  { id: "music_video",  label: "Music Video",   emoji: "🎵", recommended: false },
  { id: "short_film",   label: "Short Film",    emoji: "🎬", recommended: false },
  { id: "social",       label: "Social Cutdown",emoji: "📱", recommended: false },
  { id: "blank",        label: "Blank",         emoji: "✦",  recommended: false },
];

const STEP_NAMES = ["Workspace", "About you", "First project", "Done"];

const slideVariants = {
  enter: dir => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] } },
  exit:  dir => ({ x: dir > 0 ? -40 : 40, opacity: 0, transition: { duration: 0.18 } }),
};

/* ── Step Progress ── */
function StepProgress({ current, total }) {
  return (
    <div className="ob-progress">
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <React.Fragment key={n}>
            <div className={`ob-step ${done ? "done" : active ? "active" : ""}`}>
              <div className="ob-step-circle">
                {done ? <Check size={11} weight="bold" /> : n}
              </div>
              <span className="ob-step-label">{STEP_NAMES[i]}</span>
            </div>
            {i < total - 1 && <div className={`ob-step-line ${done ? "done" : ""}`} />}
          </React.Fragment>
        );
      })}
    </div>
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

  // Step 3
  const [projectType, setProjectType] = useState(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/login", { replace: true }); return; }
  }, [user, authLoading]);

  useEffect(() => {
    if (profile?.onboarding_completed) navigate("/", { replace: true });
  }, [profile]);

  useEffect(() => {
    if (profile?.company) setCompany(profile.company);
    if (profile?.username) { setUsername(profile.username); setUStatus("available"); }
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    const name = profile?.name || user?.user_metadata?.full_name || "";
    if (!name) return;
    const candidates = generateSuggestions(name);
    if (!candidates.length) return;
    Promise.all(
      candidates.map(u => userApi.checkUsername(u).then(r => r.available ? u : null).catch(() => null))
    ).then(results => setSuggestions(results.filter(Boolean).slice(0, 4)));
  }, [profile, user]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    setStep1Error("");
    if (!username) { setUStatus(null); setUnameMsg(""); return; }
    if (!USERNAME_RE.test(username)) { setUStatus("invalid"); setUnameMsg("3–20 chars: letters, numbers, _ or - only."); return; }
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

  async function handleStep1Continue() {
    setIsSubmitting(true); setStep1Error("");
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

  async function handleStep2Continue() {
    setIsSubmitting(true);
    try {
      await userApi.updateProfile({ role: role || null, company, onboarding_step: 3 });
      updateProfileLocally({ role, company, onboarding_step: 3 });
      goTo(3);
    } catch { goTo(3); }
    finally { setIsSubmitting(false); }
  }

  async function handleStep3Continue() {
    setIsSubmitting(true);
    try {
      await userApi.updateProfile({ onboarding_completed: true, onboarding_step: 4 });
      updateProfileLocally({ onboarding_completed: true, onboarding_step: 4 });
    } catch {}
    const path = projectType && projectType !== "blank"
      ? `/projects?new=1&type=${projectType}`
      : "/projects?new=1";
    navigate(path);
  }

  async function handleSkipAll() {
    try {
      await userApi.updateProfile({ onboarding_completed: true });
      updateProfileLocally({ onboarding_completed: true });
    } catch {}
    navigate("/");
  }

  if (authLoading) return null;

  const statusColor = {
    available: "#22c55e", taken: "#ef4444", invalid: "#f59e0b",
    reserved: "#ef4444", checking: "var(--t3)",
  }[usernameStatus] || "var(--t3)";

  const canContinueStep1 = !username || usernameStatus === "available" || username === profile?.username;

  return (
    <div className="ob-page">
      {/* Top bar */}
      <div className="ob-topbar">
        <Link to="/" className="auth-v3-logo" style={{ textDecoration: "none" }}>
          <img src="/logo.png" alt="Eastape" style={{ height: 28 }} onError={e => { e.target.style.display = "none"; }} />
        </Link>
        <button className="ob-skip-btn" onClick={handleSkipAll}>Skip for now</button>
      </div>

      <div className="ob-content">
        {/* Progress */}
        <StepProgress current={currentStep} total={4} />

        {/* Step label */}
        <p className="ob-step-label-text">
          STEP {currentStep} OF 4 · {STEP_NAMES[currentStep - 1].toUpperCase()}
        </p>

        {/* Animated step content */}
        <div className="ob-card">
          <div style={{ position: "relative", overflow: "hidden" }}>
            <AnimatePresence mode="wait" custom={dir}>

              {/* ─── STEP 1: Username ─── */}
              {currentStep === 1 && (
                <motion.div key="step1" custom={dir} variants={slideVariants} initial="enter" animate="center" exit="exit">
                  <h2 className="ob-heading">Choose your @username</h2>
                  <p className="ob-sub">How teammates will find and mention you</p>

                  <div style={{ position: "relative", marginBottom: 6, marginTop: 20 }}>
                    <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--accent)", fontSize: 14, fontWeight: 700, zIndex: 1 }}>@</span>
                    <input
                      className="auth-v3-input"
                      style={{ paddingLeft: 28, paddingRight: 80, width: "100%", boxSizing: "border-box" }}
                      placeholder="yourname"
                      value={username} maxLength={20} autoComplete="off" autoCapitalize="none" spellCheck={false}
                      onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                    />
                    <span style={{ position: "absolute", right: 42, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "var(--t4)" }}>{username.length}/20</span>
                    {usernameStatus && usernameStatus !== "checking" && (
                      <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: statusColor }}>
                        {usernameStatus === "available" ? "✓" : "✗"}
                      </span>
                    )}
                    {usernameStatus === "checking" && (
                      <span className="spinner" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", width: 13, height: 13 }} />
                    )}
                  </div>

                  {(unameMsg || step1Error) && (
                    <p style={{ fontSize: 11.5, color: step1Error ? "#ef4444" : statusColor, marginBottom: 6 }}>
                      {step1Error || unameMsg}
                    </p>
                  )}
                  <p style={{ fontSize: 11, color: "var(--t4)", marginBottom: 16 }}>Lowercase letters, numbers, _ and - only.</p>

                  {suggestions.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                      <span style={{ fontSize: 11, color: "var(--t4)", marginRight: 8 }}>Suggestions:</span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                        {suggestions.map(s => (
                          <button key={s}
                            onClick={() => { setUsername(s); setUStatus("available"); setUnameMsg("Available!"); }}
                            style={{
                              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                              borderRadius: 999, padding: "4px 11px", fontSize: 12, color: "var(--t2)", cursor: "pointer",
                            }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.22)"; e.currentTarget.style.color = "var(--text)"; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "var(--t2)"; }}
                          >{s}</button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="ob-nav">
                    <button className="ob-btn-ghost" onClick={handleStep1Skip} disabled={isSubmitting}>Skip</button>
                    <button className="ob-btn-primary" onClick={handleStep1Continue}
                      disabled={isSubmitting || !canContinueStep1 || usernameStatus === "checking"}>
                      {isSubmitting ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Saving…</> : "Continue →"}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ─── STEP 2: About you ─── */}
              {currentStep === 2 && (
                <motion.div key="step2" custom={dir} variants={slideVariants} initial="enter" animate="center" exit="exit">
                  <h2 className="ob-heading">Tell us about yourself</h2>
                  <p className="ob-sub">Helps your team know who you are</p>

                  <div style={{ marginTop: 20, marginBottom: 14 }}>
                    <label className="auth-v3-label" style={{ display: "block", marginBottom: 5 }}>Your Role</label>
                    <RoleCombobox value={role} onChange={setRole} options={ROLES} placeholder="Search or type your role…" />
                  </div>

                  <div style={{ marginBottom: 24 }}>
                    <label className="auth-v3-label" style={{ display: "block", marginBottom: 5 }}>Company / Organisation</label>
                    <input className="auth-v3-input" placeholder="Your company name (optional)"
                      value={company} onChange={e => setCompany(e.target.value)} maxLength={120}
                      style={{ width: "100%", boxSizing: "border-box" }} />
                  </div>

                  <div className="ob-nav">
                    <button className="ob-btn-ghost" onClick={() => goTo(1)}>← Back</button>
                    <button className="ob-btn-primary" onClick={handleStep2Continue} disabled={isSubmitting}>
                      {isSubmitting ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Saving…</> : "Continue →"}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ─── STEP 3: Project type ─── */}
              {currentStep === 3 && (
                <motion.div key="step3" custom={dir} variants={slideVariants} initial="enter" animate="center" exit="exit">
                  <h2 className="ob-heading">What will you work on first?</h2>
                  <p className="ob-sub">Pick a project type to get started — you can change it later</p>

                  <div className="ob-type-grid" style={{ marginTop: 20 }}>
                    {PROJECT_TYPES.map(pt => (
                      <button
                        key={pt.id}
                        className={`ob-type-card ${projectType === pt.id ? "selected" : ""}`}
                        onClick={() => setProjectType(pt.id)}
                      >
                        <span className="ob-type-emoji">{pt.emoji}</span>
                        <span className="ob-type-label">{pt.label}</span>
                        {pt.recommended && <span className="ob-type-rec">Recommended</span>}
                      </button>
                    ))}
                  </div>

                  <div className="ob-nav" style={{ marginTop: 24 }}>
                    <button className="ob-btn-ghost" onClick={() => goTo(2)}>← Back</button>
                    <button className="ob-btn-primary" onClick={handleStep3Continue} disabled={isSubmitting}>
                      {isSubmitting
                        ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Setting up…</>
                        : projectType ? "Create project →" : "Skip for now →"
                      }
                    </button>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
