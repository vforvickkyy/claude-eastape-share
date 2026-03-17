import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { EnvelopeSimple, Lock, User, Warning, Eye, EyeSlash } from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  );
}

export default function SignupPage() {
  const { signup, loginWithGoogle, user } = useAuth();
  const navigate = useNavigate();

  const [name,     setName]     = useState("");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [gLoading, setGLoading] = useState(false);

  useEffect(() => { if (user) navigate("/", { replace: true }); }, [user]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await signup(email, password, name);
      navigate("/", { replace: true });
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
    <div className="auth-page">
      <div className="auth-page-orb auth-page-orb-1" />
      <div className="auth-page-orb auth-page-orb-2" />

      <Link to="/" className="auth-page-logo">
        <img src="/logo.png" alt="Eastape" className="auth-logo-img" />
      </Link>

      <motion.div
        className="auth-card-v2"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="auth-card-heading">
          <h1 className="auth-card-title">Create account</h1>
          <p className="auth-card-sub">Start sharing files in seconds</p>
        </div>

        {error && (
          <div className="error-box">
            <Warning size={14} weight="fill" style={{ flexShrink: 0 }} />
            {error}
          </div>
        )}

        {/* Google */}
        <motion.button
          className="google-btn"
          onClick={handleGoogle}
          disabled={gLoading || loading}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
        >
          {gLoading ? <span className="spinner spinner-dark" /> : <GoogleIcon />}
          Continue with Google
        </motion.button>

        <div className="auth-divider"><span>or sign up with email</span></div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="signup-name">Full Name</label>
            <div className="form-input-wrap">
              <User size={15} className="form-icon" />
              <input
                id="signup-name" type="text" required autoComplete="name"
                className="form-input" placeholder="Your full name"
                value={name} onChange={e => setName(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="signup-email">Email</label>
            <div className="form-input-wrap">
              <EnvelopeSimple size={15} className="form-icon" />
              <input
                id="signup-email" type="email" required autoComplete="email"
                className="form-input" placeholder="you@example.com"
                value={email} onChange={e => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="signup-password">Password</label>
            <div className="form-input-wrap">
              <Lock size={15} className="form-icon" />
              <input
                id="signup-password" type={showPw ? "text" : "password"} required
                autoComplete="new-password" minLength={6}
                className="form-input" placeholder="Min. 6 characters"
                value={password} onChange={e => setPassword(e.target.value)}
              />
              <button type="button" className="pw-toggle" onClick={() => setShowPw(v => !v)} tabIndex={-1}>
                {showPw ? <EyeSlash size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <motion.button
            type="submit" className="upload-btn" disabled={loading || gLoading}
            whileHover={!loading ? { scale: 1.01 } : {}}
            whileTap={!loading ? { scale: 0.99 } : {}}
          >
            {loading ? <><span className="spinner" /> Creating account…</> : "Create Account"}
          </motion.button>
        </form>

        <p className="auth-switch">
          Already have an account?{" "}
          <Link to="/login">Sign in</Link>
        </p>

        <p className="auth-terms">
          By continuing, you agree to our{" "}
          <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </motion.div>

      <footer className="auth-page-footer">
        <span>© {new Date().getFullYear()} Eastape Films.</span>
        <Link to="/privacy">Privacy</Link>
        <span>·</span>
        <Link to="/terms">Terms</Link>
      </footer>
    </div>
  );
}
