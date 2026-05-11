import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeSlash, Warning } from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";
import { authApi } from "./lib/api";

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.54-1.38-1.33-1.74-1.33-1.74-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.48 1 .11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 3-.4c1.02.005 2.04.14 3 .4 2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.81 5.63-5.49 5.92.43.37.82 1.1.82 2.22v3.29c0 .32.21.7.83.58C20.57 21.8 24 17.3 24 12c0-6.63-5.37-12-12-12Z"/>
    </svg>
  );
}

function getStrength(pw) {
  if (!pw) return { score: 0, label: "", color: "" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, label: "Weak", color: "#ef4444" };
  if (score <= 2) return { score, label: "Fair", color: "#f59e0b" };
  if (score <= 3) return { score, label: "Good", color: "#22c55e" };
  return { score, label: "Strong", color: "#10b981" };
}

export default function SignupPage() {
  const { loginWithGoogle, user } = useAuth();
  const navigate = useNavigate();

  const [fullName,      setFullName]      = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [email,         setEmail]         = useState("");
  const [password,      setPassword]      = useState("");
  const [showPw,        setShowPw]        = useState(false);
  const [agreed,        setAgreed]        = useState(false);
  const [error,         setError]         = useState("");
  const [loading,       setLoading]       = useState(false);
  const [gLoading,      setGLoading]      = useState(false);
  const [codeSent,      setCodeSent]      = useState(false);

  useEffect(() => { if (user) navigate("/", { replace: true }); }, [user]);

  const strength = getStrength(password);
  const symbols = (password.match(/[^A-Za-z0-9]/g) || []).length;
  const upperCase = (password.match(/[A-Z]/g) || []).length;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!agreed) { setError("Please agree to the Terms and Privacy Policy."); return; }
    setError(""); setLoading(true);
    try {
      const result = await authApi.signup({ email, password, fullName });
      if (result.error) throw new Error(result.error);
      setCodeSent(true);
      setTimeout(() => navigate("/verify-otp", { state: { email, fullName } }), 500);
    } catch (err) {
      setError(err.message || "Sign up failed. Please try again.");
    } finally { setLoading(false); }
  }

  async function handleGoogle() {
    setError(""); setGLoading(true);
    try { await loginWithGoogle(); }
    catch (err) { setError(err.message || "Google sign-in failed."); setGLoading(false); }
  }

  return (
    <div className="auth-page-v3">
      <div className="auth-v3-topbar">
        <Link to="/" className="auth-v3-logo">
          <img src="/logo.png" alt="Eastape" className="auth-logo-img" onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "block"; }} />
          <span style={{ display: "none", fontWeight: 800, fontSize: 17, letterSpacing: "-0.02em" }}>Eastape Studio</span>
        </Link>
      </div>

      <motion.div
        className="auth-card-v3"
        initial={{ opacity: 0, y: 28, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="auth-v3-heading">
          <h1 className="auth-v3-title">Create your studio</h1>
          <p className="auth-v3-sub">Start a workspace for your team</p>
        </div>

        {/* Social buttons */}
        <div className="auth-v3-social-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <motion.button
            className="auth-v3-social-btn"
            onClick={handleGoogle}
            disabled={gLoading || loading}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          >
            {gLoading ? <span className="spinner spinner-dark" style={{ width: 14, height: 14 }} /> : <GoogleIcon />}
            <span>Google</span>
          </motion.button>
          <motion.button
            className="auth-v3-social-btn"
            disabled
            title="GitHub sign-in coming soon"
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          >
            <GitHubIcon />
            <span>GitHub</span>
          </motion.button>
        </div>

        <div className="auth-divider"><span>or sign up with email</span></div>

        <AnimatePresence>
          {error && (
            <motion.div className="auth-v3-error" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
              <Warning size={13} weight="fill" style={{ flexShrink: 0 }} />{error}
            </motion.div>
          )}
        </AnimatePresence>

        <form className="auth-form" onSubmit={handleSubmit}>
          {/* Name + Workspace side by side */}
          <div className="auth-v3-row">
            <div className="auth-v3-field">
              <label className="auth-v3-label" htmlFor="signup-name">Full name</label>
              <input id="signup-name" type="text" required autoComplete="name"
                className="auth-v3-input" placeholder="Jane Smith"
                value={fullName} onChange={e => setFullName(e.target.value)} />
            </div>
            <div className="auth-v3-field">
              <label className="auth-v3-label" htmlFor="signup-workspace">Workspace name</label>
              <input id="signup-workspace" type="text" autoComplete="organization"
                className="auth-v3-input" placeholder="Acme Films"
                value={workspaceName} onChange={e => setWorkspaceName(e.target.value)} />
            </div>
          </div>

          <div className="auth-v3-field">
            <label className="auth-v3-label" htmlFor="signup-email">Work email</label>
            <input id="signup-email" type="email" required autoComplete="email"
              className="auth-v3-input" placeholder="you@company.com"
              value={email} onChange={e => setEmail(e.target.value)} />
          </div>

          <div className="auth-v3-field">
            <label className="auth-v3-label" htmlFor="signup-password">Password</label>
            <div style={{ position: "relative" }}>
              <input id="signup-password" type={showPw ? "text" : "password"} required
                autoComplete="new-password" minLength={6} className="auth-v3-input"
                placeholder="Min. 8 characters" style={{ paddingRight: 40 }}
                value={password} onChange={e => setPassword(e.target.value)} />
              <button type="button" className="pw-toggle" onClick={() => setShowPw(v => !v)} tabIndex={-1}>
                {showPw ? <EyeSlash size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {/* Strength meter */}
            {password.length > 0 && (
              <div style={{ marginTop: 7 }}>
                <div className="auth-v3-strength-bar">
                  {[1,2,3,4].map(i => (
                    <div key={i} className="auth-v3-strength-seg" style={{ background: i <= strength.score ? strength.color : undefined }} />
                  ))}
                </div>
                <p className="auth-v3-strength-text" style={{ color: strength.color }}>
                  {strength.label}
                  {password.length > 0 && ` · ${password.length} chars`}
                  {symbols > 0 && ` · ${symbols} symbol`}
                </p>
              </div>
            )}
          </div>

          <label className="auth-v3-check-row">
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="auth-v3-check" />
            <span className="auth-v3-check-label">
              I agree to the{" "}
              <Link to="/terms" onClick={e => e.stopPropagation()}>Terms</Link>
              {" "}and{" "}
              <Link to="/privacy" onClick={e => e.stopPropagation()}>Privacy Policy</Link>
            </span>
          </label>

          <motion.button
            type="submit" className="auth-v3-submit" disabled={loading || gLoading || codeSent}
            whileHover={!loading ? { scale: 1.01 } : {}}
            whileTap={!loading ? { scale: 0.99 } : {}}
          >
            {codeSent
              ? "Code sent! Redirecting…"
              : loading
                ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Creating workspace…</>
                : <><span>✦ Create workspace</span></>
            }
          </motion.button>
        </form>

        <p className="auth-v3-switch">
          Already have a studio?{" "}
          <Link to="/login">Log in</Link>
        </p>
      </motion.div>

      <footer className="auth-v3-footer">
        <Link to="/terms">Terms</Link>
        <span>·</span>
        <Link to="/privacy">Privacy</Link>
        <span>·</span>
        <a href="https://status.eastape.com" target="_blank" rel="noreferrer">Status</a>
      </footer>
    </div>
  );
}
