import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { EnvelopeSimple, Lock, User, CheckCircle, Warning } from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";
import SiteHeader from "./SiteHeader";

export default function SignupPage() {
  const { signup, user } = useAuth();
  const navigate = useNavigate();

  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);

  // Already logged in → go home
  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signup(email, password, name);
      setDone(true);
    } catch (err) {
      setError(err.message || "Sign up failed. Please try again.");
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
          {done ? (
            /* ── Email confirmation screen ── */
            <div className="auth-success">
              <CheckCircle size={40} weight="thin" style={{ color: "#6ee7b7" }} />
              <h2 className="auth-title" style={{ textAlign: "center" }}>Check your email</h2>
              <p style={{ fontSize: "13.5px", color: "var(--t2)", lineHeight: 1.65, textAlign: "center" }}>
                We sent a confirmation link to{" "}
                <strong style={{ color: "var(--t1)" }}>{email}</strong>.<br />
                Click the link to activate your account, then sign in.
              </p>
              <Link to="/login" className="upload-btn" style={{ textDecoration: "none", justifyContent: "center" }}>
                Go to Login
              </Link>
            </div>
          ) : (
            <>
              {/* Heading */}
              <div className="auth-header">
                <span className="hero-eyebrow">Get started</span>
                <h1 className="auth-title">
                  Create your<br />
                  <span className="hero-title-accent">Account</span>
                </h1>
              </div>

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
                  <label className="form-label" htmlFor="signup-name">Full Name</label>
                  <div className="form-input-wrap">
                    <User size={15} className="form-icon" />
                    <input
                      id="signup-name"
                      type="text"
                      required
                      autoComplete="name"
                      className="form-input"
                      placeholder="Your full name"
                      value={name}
                      onChange={e => setName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="signup-email">Email</label>
                  <div className="form-input-wrap">
                    <EnvelopeSimple size={15} className="form-icon" />
                    <input
                      id="signup-email"
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
                  <label className="form-label" htmlFor="signup-password">Password</label>
                  <div className="form-input-wrap">
                    <Lock size={15} className="form-icon" />
                    <input
                      id="signup-password"
                      type="password"
                      required
                      autoComplete="new-password"
                      minLength={6}
                      className="form-input"
                      placeholder="Min. 6 characters"
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
                    ? <><span className="spinner" /> Creating account…</>
                    : "Create Account"
                  }
                </motion.button>
              </form>

              <p className="auth-switch">
                Already have an account?{" "}
                <Link to="/login">Sign in</Link>
              </p>
            </>
          )}
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
