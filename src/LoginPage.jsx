import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { EnvelopeSimple, Lock, Warning } from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";
import SiteHeader from "./SiteHeader";

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Message passed when redirected here from a protected action
  const redirectMsg = location.state?.message;

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  // Already logged in → go home
  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err.message || "Login failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="noise" />
      <SiteHeader />

      <main className="auth-main">
        <motion.div
          className="auth-card glass-card"
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Heading */}
          <div className="auth-header">
            <span className="hero-eyebrow">Welcome back</span>
            <h1 className="auth-title">
              Sign In to<br />
              <span className="hero-title-accent">Eastape Share</span>
            </h1>
          </div>

          {/* Redirect message (e.g. "please log in to upload") */}
          {redirectMsg && (
            <div className="login-required-msg">
              <Lock size={13} weight="fill" style={{ flexShrink: 0 }} />
              {redirectMsg}
            </div>
          )}

          {/* Auth error */}
          {error && (
            <div className="error-box">
              <Warning size={14} weight="fill" style={{ flexShrink: 0, marginTop: 1 }} />
              {error}
            </div>
          )}

          {/* Form */}
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="login-email">Email</label>
              <div className="form-input-wrap">
                <EnvelopeSimple size={15} className="form-icon" />
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  className="form-input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="login-password">Password</label>
              <div className="form-input-wrap">
                <Lock size={15} className="form-icon" />
                <input
                  id="login-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className="form-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>
            </div>

            <motion.button
              type="submit"
              className="upload-btn"
              disabled={loading}
              whileHover={!loading ? { scale: 1.01 } : {}}
              whileTap={!loading ? { scale: 0.99 } : {}}
            >
              {loading
                ? <><span className="spinner" /> Signing in…</>
                : "Sign In"
              }
            </motion.button>
          </form>

          <p className="auth-switch">
            Don&apos;t have an account?{" "}
            <Link to="/signup">Sign up free</Link>
          </p>
        </motion.div>
      </main>

      <footer className="site-footer">
        <span>© {new Date().getFullYear()} Eastape Films. All rights reserved.</span>
        <span className="footer-links">
          <Link to="/privacy">Privacy Policy</Link>
          <span className="footer-sep">·</span>
          <Link to="/terms">Terms &amp; Conditions</Link>
        </span>
      </footer>
    </div>
  );
}
