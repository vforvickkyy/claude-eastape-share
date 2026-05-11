import React, { useState, useEffect, useRef, createRef, useCallback } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, CheckCircle } from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";
import { authApi } from "./lib/api";

export default function OTPVerificationPage() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { user, verifyOTP } = useAuth();

  const email       = location.state?.email    || "";
  const fullName    = location.state?.fullName || "";
  const infoMessage = location.state?.message  || "";

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

  const inputRefs = useRef([...Array(6)].map(() => createRef()));

  useEffect(() => { inputRefs.current[0]?.current?.focus(); }, []);

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
      setError(msg.includes("expired") ? "Code expired. Request a new one." : "Incorrect code. Try again.");
      setOtp(["", "", "", "", "", ""]);
      setTimeout(() => inputRefs.current[0]?.current?.focus(), 50);
      triggerShake();
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
    if (val && index < 5) inputRefs.current[index + 1]?.current?.focus();
    if (next.every(d => d !== "")) submitOTP(next);
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

  function boxClass(index) {
    const filled = otp[index] !== "";
    if (isVerified) return "otp-box otp-box-verified";
    if (error) return "otp-box otp-box-error";
    if (filled) return "otp-box otp-box-filled";
    return "otp-box";
  }

  if (!email) return null;

  return (
    <div className="auth-page-v3">
      {/* Back link */}
      <div className="auth-v3-topbar">
        <Link to="/login" className="auth-v3-back">
          <ArrowLeft size={13} weight="bold" /> Back to log in
        </Link>
      </div>

      <motion.div
        className="auth-card-v3"
        initial={{ opacity: 0, y: 28, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="auth-v3-heading">
          <h1 className="auth-v3-title">Enter your code</h1>
          <p className="auth-v3-sub">
            Sent to <strong style={{ color: "var(--t1)" }}>{email}</strong>
            {resendCooldown > 0 && !isVerified && (
              <span className="otp-timer"> · {resendCooldown}s</span>
            )}
          </p>
        </div>

        {/* Code sent status pill */}
        {!error && !isVerified && (
          <div className="otp-status-pill">
            <span className="otp-status-dot" />
            Code sent · check inbox
          </div>
        )}

        {/* Info banner */}
        {infoMessage && (
          <div className="auth-v3-info">{infoMessage}</div>
        )}

        {/* OTP boxes */}
        <div onPaste={handlePaste}>
          <motion.div
            className="otp-boxes-row"
            animate={shake ? { x: [-5, 5, -5, 5, -3, 3, 0] } : { x: 0 }}
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
                className={boxClass(i)}
                disabled={isLoading || isVerified}
                onChange={e => handleChange(i, e)}
                onKeyDown={e => handleKeyDown(i, e)}
                onFocus={e => e.target.select()}
              />
            ))}
          </motion.div>

          {/* Status below boxes */}
          <div className="otp-status-msg">
            <AnimatePresence mode="wait">
              {isLoading && (
                <motion.p key="v" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  style={{ color: "var(--t3)", fontSize: 12 }}>
                  <span className="spinner" style={{ display: "inline-block", width: 12, height: 12, marginRight: 6 }} />
                  Verifying…
                </motion.p>
              )}
              {isVerified && !isLoading && (
                <motion.p key="ok" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                  style={{ color: "#10b981", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 5, justifyContent: "center" }}>
                  <CheckCircle size={14} weight="fill" /> Email verified! Redirecting…
                </motion.p>
              )}
              {error && !isLoading && !isVerified && (
                <motion.p key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  style={{ color: "#ef4444", fontSize: 12 }}>
                  {error}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Verify button */}
        <motion.button
          className="auth-v3-submit"
          disabled={isLoading || isVerified || otp.some(d => !d)}
          onClick={() => submitOTP(otp)}
          whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
        >
          {isLoading
            ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Verifying…</>
            : isVerified
              ? <><CheckCircle size={14} weight="fill" /> Verified!</>
              : "✓ Verify & continue"
          }
        </motion.button>

        {/* Resend row */}
        <div className="otp-resend-row">
          {resendCount >= 3 ? (
            <span>Too many attempts · <a href="mailto:support@eastape.com">Contact support</a></span>
          ) : isResending ? (
            <span><span className="spinner" style={{ display: "inline-block", width: 11, height: 11, marginRight: 5 }} />Sending…</span>
          ) : resendCooldown > 0 ? (
            <span className="otp-resend-wait">Resend in {resendCooldown}s</span>
          ) : (
            <button type="button" className="otp-resend-btn" onClick={handleResend}>
              Resend code
            </button>
          )}
          <span className="otp-resend-sep">·</span>
          <Link to="/signup">Use a different email</Link>
        </div>
      </motion.div>

      <footer className="auth-v3-footer">
        <Link to="/terms">Terms</Link>
        <span>·</span>
        <Link to="/privacy">Privacy</Link>
      </footer>
    </div>
  );
}
