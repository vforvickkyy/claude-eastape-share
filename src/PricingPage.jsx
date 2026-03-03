import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  Check, X, Star, Lightning, Buildings, Package,
} from "@phosphor-icons/react";
import SiteHeader from "./SiteHeader";
import DashboardLayout from "./DashboardLayout";

/* ─── Plan data ──────────────────────────────────────── */
const PLANS = [
  {
    id: "free",
    tier: "FREE",
    name: "Starter",
    price: 0,
    period: null,
    tagline: "Get started for free. No card required.",
    Icon: Star,
    highlight: false,
    badge: null,
    features: [
      { label: "2 GB total storage",              ok: true  },
      { label: "500 MB max file size",             ok: true  },
      { label: "7-day link expiry",                ok: true  },
      { label: "Basic sharing (link + download)",  ok: true  },
      { label: "Public download links",            ok: true  },
      { label: "Eastape branding on pages",        ok: false, note: "branding" },
      { label: "Password-protected links",         ok: false },
      { label: "Download analytics",               ok: false },
      { label: "Folder organisation",              ok: false },
      { label: "Custom domain",                    ok: false },
      { label: "API access",                       ok: false },
    ],
    cta: "Get Started Free",
    ctaTo: "/signup",
    ctaClass: "pricing-cta-ghost",
    addons: [],
  },
  {
    id: "pro",
    tier: "PRO",
    name: "Creator",
    price: 199,
    period: "month",
    tagline: "For creators, freelancers & growing businesses.",
    Icon: Lightning,
    highlight: true,
    badge: "Most Popular",
    features: [
      { label: "200 GB total storage",             ok: true  },
      { label: "20 GB max file size",              ok: true  },
      { label: "30-day link expiry",               ok: true  },
      { label: "Advanced sharing",                 ok: true  },
      { label: "Public download links",            ok: true  },
      { label: "No Eastape branding",              ok: true  },
      { label: "Password-protected links",         ok: true  },
      { label: "Basic download analytics",         ok: true  },
      { label: "Folder organisation",              ok: true  },
      { label: "Custom domain",                    ok: false, addon: "₹149/mo add-on" },
      { label: "API access",                       ok: false },
    ],
    cta: "Start PRO",
    ctaTo: "/signup",
    ctaClass: "pricing-cta-primary",
    addons: [
      { label: "Extra 100 GB storage",  price: "₹79 / mo" },
      { label: "Custom domain",         price: "₹149 / mo" },
    ],
  },
  {
    id: "studio",
    tier: "STUDIO",
    name: "Professional",
    price: 999,
    period: "month",
    tagline: "For agencies, studios & professional teams.",
    Icon: Buildings,
    highlight: false,
    badge: "Best Value",
    features: [
      { label: "2 TB total storage",               ok: true  },
      { label: "100 GB max file size",             ok: true  },
      { label: "90-day link expiry",               ok: true  },
      { label: "Advanced sharing",                 ok: true  },
      { label: "Public download links",            ok: true  },
      { label: "White-label (no branding)",        ok: true  },
      { label: "Password-protected links",         ok: true  },
      { label: "Full download analytics",          ok: true  },
      { label: "Folder organisation",              ok: true  },
      { label: "Custom domain — included",         ok: true  },
      { label: "Full API access",                  ok: true  },
    ],
    cta: "Get STUDIO",
    ctaTo: "/signup",
    ctaClass: "pricing-cta-ghost",
    addons: [
      { label: "Up to 10 team users",   price: "Included" },
      { label: "Audit logs",            price: "Included" },
      { label: "Priority support",      price: "Included" },
    ],
  },
];

/* ─── Plan card ─────────────────────────────────────── */
function PlanCard({ plan }) {
  const { tier, name, price, period, tagline, Icon, highlight, badge, features, cta, ctaTo, ctaClass, addons } = plan;

  return (
    <div className={`pricing-card ${highlight ? "pricing-card--highlight" : ""}`}>
      {badge && <div className="pricing-badge">{badge}</div>}

      <div className="pricing-card-head">
        <div className={`pricing-icon pricing-icon--${plan.id}`}>
          <Icon size={20} weight="duotone" />
        </div>
        <div>
          <div className="pricing-tier">{tier}</div>
          <div className="pricing-name">{name}</div>
        </div>
      </div>

      <div className="pricing-price">
        {price === 0 ? (
          <span className="pricing-amount">₹0</span>
        ) : (
          <>
            <span className="pricing-amount">₹{price.toLocaleString("en-IN")}</span>
            <span className="pricing-period"> / {period}</span>
          </>
        )}
      </div>

      <p className="pricing-tagline">{tagline}</p>

      <Link to={ctaTo} className={`pricing-cta ${ctaClass}`}>{cta}</Link>

      <ul className="pricing-features">
        {features.map((f, i) => (
          <li key={i} className={`pricing-feature ${f.ok ? "ok" : "no"}`}>
            <span className="feature-icon">
              {f.ok ? <Check size={13} weight="bold" /> : <X size={13} weight="bold" />}
            </span>
            <span className="feature-label">
              {f.label}
              {f.addon && <span className="feature-addon">{f.addon}</span>}
            </span>
          </li>
        ))}
      </ul>

      {addons.length > 0 && (
        <div className="pricing-addons">
          <div className="pricing-addons-title">
            <Package size={12} weight="bold" /> {plan.id === "studio" ? "Included extras" : "Available add-ons"}
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

/* ─── Main content ──────────────────────────────────── */
function PricingContent() {
  return (
    <div className="pricing-wrap">
      <div className="pricing-hero">
        <h1 className="pricing-headline">Simple, transparent pricing</h1>
        <p className="pricing-sub">
          Start free. Upgrade when you need more power. No hidden fees, no surprises.
        </p>
      </div>

      <div className="pricing-grid">
        {PLANS.map(plan => <PlanCard key={plan.id} plan={plan} />)}
      </div>

      <div className="pricing-note">
        All prices in Indian Rupees (₹) · Billed monthly · Cancel anytime
      </div>
    </div>
  );
}

/* ─── Page export — dual layout ─────────────────────── */
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
