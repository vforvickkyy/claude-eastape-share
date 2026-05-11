import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeSlash, Warning, ArrowRight } from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";

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

function AppleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11Z"/>
    </svg>
  );
}

export default function LoginPage() {
  const { login, loginWithGoogle, user } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const redirectMsg = location.state?.message;

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [remember, setRemember] = useState(false);
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [gLoading, setGLoading] = useState(false);
  const [success,  setSuccess]  = useState(false);

  useEffect(() => { if (user) navigate("/", { replace: true }); }, [user]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const result = await login(email, password);
      if (result.requiresVerification) {
        navigate("/verify-otp", { state: { email: result.email, message: result.message } });
        return;
      }
      setSuccess(true);
      setTimeout(() => navigate("/"), 400);
    } catch (err) {
      setError(err.message || "Incorrect email or password.");
    } finally { setLoading(false); }
  }

  async function handleGoogle() {
    setError(""); setGLoading(true);
    try { await loginWithGoogle(); }
    catch (err) { setError(err.message || "Google sign-in failed."); setGLoading(false); }
  }

  return (
    <div className="auth-page-v3">
      {/* Top-left logo */}
      <div className="auth-v3-topbar">
        <Link to="/" className="auth-v3-logo">
          <img src="/logo.png" alt="Eastape" className="auth-logo-img" onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "block"; }} />
          <span style={{ display: "none", fontWeight: 800, fontSize: 17, letterSpacing: "-0.02em" }}>Eastape Studio</span>
        </Link>
      </div>

      {/* Card */}
      <motion.div
        className="auth-card-v3"
        initial={{ opacity: 0, y: 28, scale: 0.97 }}
        animate={success ? { opacity: 0, y: -20, scale: 1.01 } : { opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="auth-v3-heading">
          <h1 className="auth-v3-title">Log in</h1>
          <p className="auth-v3-sub">Welcome back to your studio</p>
        </div>

        {/* Social buttons */}
        <div className="auth-v3-social-row">
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
            title="Apple sign-in coming soon"
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          >
            <AppleIcon />
            <span>Apple</span>
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

        <div className="auth-divider"><span>or continue with email</span></div>

        <AnimatePresence>
          {(error || redirectMsg) && (
            <motion.div
              className="auth-v3-error"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              <Warning size={13} weight="fill" style={{ flexShrink: 0 }} />
              {error || redirectMsg}
            </motion.div>
          )}
        </AnimatePresence>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-v3-field">
            <label className="auth-v3-label" htmlFor="login-email">Email</label>
            <input
              id="login-email" type="email" required autoComplete="email"
              className="auth-v3-input" placeholder="you@company.com"
              value={email} onChange={e => setEmail(e.target.value)}
            />
          </div>

          <div className="auth-v3-field">
            <div className="auth-v3-label-row">
              <label className="auth-v3-label" htmlFor="login-password">Password</label>
              <Link to="/forgot-password" className="auth-v3-forgot">Forgot?</Link>
            </div>
            <div style={{ position: "relative" }}>
              <input
                id="login-password" type={showPw ? "text" : "password"} required
                autoComplete="current-password" className="auth-v3-input" placeholder="••••••••"
                style={{ paddingRight: 40 }}
                value={password} onChange={e => setPassword(e.target.value)}
              />
              <button type="button" className="pw-toggle" onClick={() => setShowPw(v => !v)} tabIndex={-1}>
                {showPw ? <EyeSlash size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <label className="auth-v3-check-row">
            <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="auth-v3-check" />
            <span className="auth-v3-check-label">Keep me signed in</span>
          </label>

          <motion.button
            type="submit" className="auth-v3-submit" disabled={loading || gLoading}
            whileHover={!loading ? { scale: 1.01 } : {}}
            whileTap={!loading ? { scale: 0.99 } : {}}
          >
            {loading
              ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Signing in…</>
              : <><span>Continue</span><ArrowRight size={14} weight="bold" /></>
            }
          </motion.button>
        </form>

        <p className="auth-v3-switch">
          New here?{" "}
          <Link to="/signup">Create an account</Link>
          <span className="auth-v3-switch-sep">·</span>
          <span className="auth-v3-switch-free">It's free.</span>
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
