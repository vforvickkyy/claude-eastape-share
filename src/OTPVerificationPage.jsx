import React, { useState, useEffect, useRef, createRef, useCallback } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "./context/AuthContext";
import { authApi } from "./lib/api";

export default function OTPVerificationPage() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { user, verifyOTP } = useAuth();

  const email    = location.state?.email    || "";
  const fullName = location.state?.fullName || "";

  // Redirect guards
  useEffect(() => {
    if (!email) navigate("/signup", { replace: true });
  }, []);
  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user]);

  const [otp,            setOtp]            = useState(["", "", "", "", "", ""]);
  const [isLoading,      setIsLoading]      = useState(false);
  const [isVerified,     setIsVerified]     = useState(false);
  const [error,          setError]          = useState("");
  const [shake,          setShake]          = useState(false);
  const [resendCooldown, setResendCooldown] = useState(30);
  const [resendCount,    setResendCount]    = useState(0);
  const [isResending,    setIsResending]    = useState(false);

  // 6 individual input refs
  const inputRefs = useRef([...Array(6)].map(() => createRef()));

  // Auto-focus first box on mount
  useEffect(() => {
    inputRefs.current[0]?.current?.focus();
  }, []);

  // Resend cooldown ticker
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const triggerShake = useCallback(() => {
    setShake(true);
    setTimeout(() => setShake(false), 450);
  }, []);

  async function submitOTP(digits) {
    const code = digits.join("");
    if (code.length !== 6) return;
    setIsLoading(true);
    setError("");
    try {
      const result = await verifyOTP(email, code);
      if (result.error) throw new Error(result.error);
      setIsVerified(true);
      setTimeout(() => navigate("/onboarding", { replace: true }), 1000);
    } catch (err) {
      const msg = err.message || "Invalid code. Please try again.";
      setError(msg.includes("expired") ? "Code expired. Request a new one." : msg);
      setOtp(["", "", "", "", "", ""]);
      setTimeout(() => inputRefs.current[0]?.current?.focus(), 50);
      triggerShake();
      // If expired, reset cooldown so resend is immediately available
      if (msg.includes("expired")) setResendCooldown(0);
    } finally {
      setIsLoading(false);
    }
  }

  function handleChange(index, e) {
    if (isLoading || isVerified) return;
    const val = e.target.value.replace(/[^0-9]/g, "").slice(-1);
    setError("");
    const next = [...otp];
    next[index] = val;
    setOtp(next);
    if (val && index < 5) {
      inputRefs.current[index + 1]?.current?.focus();
    }
    if (next.every(d => d !== "")) {
      submitOTP(next);
    }
  }

  function handleKeyDown(index, e) {
    if (isLoading || isVerified) return;
    if (e.key === "Backspace") {
      if (otp[index] === "" && index > 0) {
        const next = [...otp];
        next[index - 1] = "";
        setOtp(next);
        inputRefs.current[index - 1]?.current?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.current?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      inputRefs.current[index + 1]?.current?.focus();
    }
  }

  function handlePaste(e) {
    if (isLoading || isVerified) return;
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/[^0-9]/g, "").slice(0, 6);
    if (text.length === 6) {
      const digits = text.split("");
      setOtp(digits);
      setError("");
      inputRefs.current[5]?.current?.focus();
      setTimeout(() => submitOTP(digits), 100);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0 || resendCount >= 3 || isResending) return;
    setIsResending(true);
    setError("");
    try {
      const result = await authApi.resendOTP(email);
      if (result.error) throw new Error(result.error);
      setResendCount(c => c + 1);
      setResendCooldown(30);
      setOtp(["", "", "", "", "", ""]);
      setTimeout(() => inputRefs.current[0]?.current?.focus(), 50);
    } catch (err) {
      setError(err.message || "Failed to resend code.");
    } finally {
      setIsResending(false);
    }
  }

  // Box style per state
  function boxStyle(index) {
    const filled    = otp[index] !== "";
    const base = {
      width: 46, height: 56, borderRadius: 12,
      fontSize: 24, fontWeight: 700, color: "white",
      textAlign: "center", border: "1px solid",
      outline: "none", background: "rgba(255,255,255,0.05)",
      transition: "border 150ms, box-shadow 150ms, background 150ms",
      cursor: "text", fontFamily: "monospace",
    };
    if (isVerified)  return { ...base, borderColor: "#10b981", background: "rgba(16,185,129,0.1)", boxShadow: "0 0 0 3px rgba(16,185,129,0.15)" };
    if (error)       return { ...base, borderColor: "#ef4444", background: "rgba(239,68,68,0.06)", boxShadow: "0 0 0 3px rgba(239,68,68,0.12)" };
    if (filled)      return { ...base, borderColor: "rgba(124,58,237,0.5)", background: "rgba(124,58,237,0.1)" };
    return { ...base, borderColor: "rgba(255,255,255,0.1)" };
  }

  if (!email) return null;

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
        {/* Header */}
        <div className="auth-card-heading" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✉️</div>
          <h1 className="auth-card-title">Check your email</h1>
          <p className="auth-card-sub">We sent a 6-digit verification code to:</p>
          <p style={{ color: "#a78bfa", fontWeight: 600, fontSize: 14, marginTop: 6 }}>{email}</p>
        </div>

        {/* OTP boxes */}
        <div
          style={{ marginTop: 28 }}
          onPaste={handlePaste}
        >
          <motion.div
            style={{ display: "flex", gap: 8, justifyContent: "center" }}
            animate={shake ? { x: [-4, 4, -4, 4, -2, 2, 0] } : { x: 0 }}
            transition={{ duration: 0.4 }}
          >
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={inputRefs.current[i]}
                type="tel"
                inputMode="numeric"
                maxLength={1}
                autoComplete={i === 0 ? "one-time-code" : "off"}
                value={digit}
                style={boxStyle(i)}
                disabled={isLoading || isVerified}
                onChange={e => handleChange(i, e)}
                onKeyDown={e => handleKeyDown(i, e)}
                onFocus={e => e.target.select()}
              />
            ))}
          </motion.div>

          {/* Status below boxes */}
          <div style={{ minHeight: 24, marginTop: 12, textAlign: "center" }}>
            <AnimatePresence mode="wait">
              {isLoading && (
                <motion.p
                  key="verifying"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  style={{ color: "var(--t3)", fontSize: 13 }}
                >
                  <span className="spinner" style={{ display: "inline-block", marginRight: 6 }} />
                  Verifying…
                </motion.p>
              )}
              {isVerified && !isLoading && (
                <motion.p
                  key="verified"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  style={{ color: "#10b981", fontSize: 13, fontWeight: 600 }}
                >
                  Email verified! ✅ Redirecting to setup…
                </motion.p>
              )}
              {error && !isLoading && !isVerified && (
                <motion.p
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  style={{ color: "#ef4444", fontSize: 13 }}
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Resend section */}
        <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 20, textAlign: "center" }}>
          <p style={{ color: "var(--t3)", fontSize: 13, marginBottom: 8 }}>Didn't receive it?</p>

          {resendCount >= 3 ? (
            <p style={{ color: "var(--t3)", fontSize: 13 }}>
              Too many attempts.{" "}
              <a href="mailto:support@eastape.com" style={{ color: "var(--purple-l)", textDecoration: "none" }}>
                Contact support
              </a>
            </p>
          ) : isResending ? (
            <p style={{ color: "var(--t3)", fontSize: 13 }}>
              <span className="spinner" style={{ display: "inline-block", marginRight: 6 }} />
              Sending…
            </p>
          ) : resendCooldown > 0 ? (
            <p style={{ color: "var(--t3)", fontSize: 13 }}>Resend in {resendCooldown}s</p>
          ) : (
            <button
              onClick={handleResend}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "var(--purple-l)", fontSize: 13, fontWeight: 600,
                padding: "4px 8px", borderRadius: 6,
              }}
            >
              Resend Code
            </button>
          )}
        </div>

        {/* Wrong email */}
        <p style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "var(--t3)" }}>
          Wrong email?{" "}
          <Link to="/signup" style={{ color: "var(--purple-l)", textDecoration: "none", fontWeight: 600 }}>
            Go back
          </Link>
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
