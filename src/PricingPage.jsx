import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Check, X, Package, CircleNotch,
} from "@phosphor-icons/react";
import SiteHeader from "./SiteHeader";
import DashboardLayout from "./DashboardLayout";

const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/* ── Fetch plans from DB (public, anon key is fine) ─────── */
async function fetchPlans() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/plans?is_active=eq.true&order=sort_order.asc`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
    }
  );
  if (!res.ok) throw new Error("Failed to load plans");
  return res.json();
}

/* ── Plan Card ──────────────────────────────────────────── */
function PlanCard({ plan }) {
  const currency = plan.currency_symbol || "₹";
  const features = Array.isArray(plan.features) ? plan.features : [];
  const addons   = Array.isArray(plan.addons)   ? plan.addons   : [];

  return (
    <div className={`pricing-card ${plan.is_highlighted ? "pricing-card--highlight" : ""}`}>
      {plan.badge_text && (
        <div className="pricing-badge">{plan.badge_text}</div>
      )}

      <div className="pricing-card-head">
        <div className={`pricing-icon pricing-icon--${plan.name}`} />
        <div>
          <div className="pricing-tier">{plan.tier_label || plan.name?.toUpperCase()}</div>
          <div className="pricing-name">{plan.display_name || plan.name}</div>
        </div>
      </div>

      <div className="pricing-price">
        {(plan.price_monthly ?? 0) === 0 ? (
          <span className="pricing-amount">{currency}0</span>
        ) : (
          <>
            <span className="pricing-amount">
              {currency}{Number(plan.price_monthly).toLocaleString("en-IN")}
            </span>
            <span className="pricing-period"> / month</span>
          </>
        )}
      </div>

      <p className="pricing-tagline">{plan.tagline}</p>

      <Link
        to="/signup"
        className={`pricing-cta ${plan.is_highlighted ? "pricing-cta-primary" : "pricing-cta-ghost"}`}
      >
        {plan.cta_text || "Get Started"}
      </Link>

      <ul className="pricing-features">
        {features.map((f, i) => {
          const isLocked = typeof f === "object" ? !f.ok : false;
          const label    = typeof f === "object" ? f.label : f;
          const addon    = typeof f === "object" ? f.addon : null;
          return (
            <li key={i} className={`pricing-feature ${isLocked ? "no" : "ok"}`}>
              <span className="feature-icon">
                {isLocked
                  ? <X size={13} weight="bold" />
                  : <Check size={13} weight="bold" />}
              </span>
              <span className="feature-label">
                {label}
                {addon && <span className="feature-addon">{addon}</span>}
              </span>
            </li>
          );
        })}
      </ul>

      {addons.length > 0 && (
        <div className="pricing-addons">
          <div className="pricing-addons-title">
            <Package size={12} weight="bold" />
            {plan.name === "professional" ? "Included extras" : "Available add-ons"}
          </div>
          {addons.map((a, i) => (
            <div key={i} className="pricing-addon-row">
              <span>{a.label}</span>
              <span className="addon-price">{a.price}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main content ───────────────────────────────────────── */
function PricingContent() {
  const [plans, setPlans]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlans()
      .then(setPlans)
      .catch(() => setPlans([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="pricing-wrap">
      <div className="pricing-hero">
        <h1 className="pricing-headline">Simple, transparent pricing</h1>
        <p className="pricing-sub">
          Start free. Upgrade when you need more power. No hidden fees, no surprises.
        </p>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "60px 0", color: "var(--t3)" }}>
          <CircleNotch size={28} style={{ animation: "spin 0.8s linear infinite" }} />
        </div>
      ) : (
        <div className="pricing-grid">
          {plans.map(plan => <PlanCard key={plan.id} plan={plan} />)}
        </div>
      )}

      <div className="pricing-note">
        All prices in Indian Rupees (₹) · Billed monthly · Cancel anytime
      </div>
    </div>
  );
}

/* ── Page export — dual layout ──────────────────────────── */
export default function PricingPage({ inDashboard = false }) {
  if (inDashboard) {
    return (
      <DashboardLayout title="Plans">
        <PricingContent />
      </DashboardLayout>
    );
  }

  return (
    <div className="pricing-page-wrap">
      <SiteHeader />
      <div className="pricing-page-body">
        <PricingContent />
      </div>
    </div>
  );
}
