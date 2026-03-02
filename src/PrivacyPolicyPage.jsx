import { Link } from "react-router-dom";
import { ArrowLeft } from "@phosphor-icons/react";
import SiteHeader from "./SiteHeader";

export default function PrivacyPolicyPage() {
  return (
    <div className="page legal-page">
      <div className="noise" />

      <SiteHeader extra={
        <Link to="/" className="back-link">
          <ArrowLeft size={14} weight="bold" /> Back to Home
        </Link>
      } />

      <main className="legal-main">
        <div className="legal-card">
          <div className="legal-header">
            <span className="legal-eyebrow">Legal</span>
            <h1 className="legal-title">Privacy Policy</h1>
            <p className="legal-meta">Last updated: March 2026</p>
          </div>

          <section className="legal-section">
            <h2>1. Overview</h2>
            <p>
              Eastape Share ("we", "our", or "us") is committed to protecting your privacy. This
              Privacy Policy explains how we collect, use, and safeguard information when you use
              our file-sharing service at Eastape Share. By using the service, you agree to the
              practices described in this policy.
            </p>
          </section>

          <section className="legal-section">
            <h2>2. Information We Collect</h2>
            <h3>Files You Upload</h3>
            <p>
              When you upload files, we temporarily store them on our secure servers to generate a
              shareable link. We do not inspect, analyse, or read the contents of your files beyond
              what is required to provide the service (e.g. file name, size, and MIME type).
            </p>
            <h3>Usage Data</h3>
            <p>
              We may collect non-personally identifiable usage data such as browser type, device
              type, pages visited, and timestamps. This information helps us improve the service
              and diagnose technical issues.
            </p>
            <h3>No Account Required</h3>
            <p>
              We do not require you to create an account. We do not collect names, email addresses,
              or any personally identifiable information unless you voluntarily contact us.
            </p>
          </section>

          <section className="legal-section">
            <h2>3. How We Use Your Information</h2>
            <ul>
              <li>To provide and operate the file-sharing service.</li>
              <li>To generate and serve secure, time-limited download links.</li>
              <li>To monitor and improve service performance and reliability.</li>
              <li>To detect and prevent abuse or violations of our Terms of Service.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>4. File Retention</h2>
            <p>
              Uploaded files are stored temporarily and are automatically deleted after a set
              retention period (typically 7 days) or sooner at your request. We do not retain files
              beyond what is necessary to fulfil the purpose of the upload.
            </p>
          </section>

          <section className="legal-section">
            <h2>5. Data Sharing & Third Parties</h2>
            <p>
              We do not sell, rent, or trade your information to third parties. We use trusted
              cloud infrastructure providers (including AWS S3-compatible storage and Supabase) to
              store and manage files. These providers operate under their own privacy policies and
              are subject to appropriate data processing agreements.
            </p>
          </section>

          <section className="legal-section">
            <h2>6. Security</h2>
            <p>
              Files are served via presigned, time-limited URLs to restrict unauthorised access.
              We implement industry-standard security measures including encrypted data transmission
              (HTTPS/TLS) and access controls. However, no system is completely immune to security
              risks, and we cannot guarantee absolute security.
            </p>
          </section>

          <section className="legal-section">
            <h2>7. Cookies</h2>
            <p>
              We do not use tracking cookies or third-party analytics cookies. We may use
              session-level storage in your browser solely to support the functionality of the
              service (e.g. remembering upload state within a session).
            </p>
          </section>

          <section className="legal-section">
            <h2>8. Children's Privacy</h2>
            <p>
              This service is not directed to children under 13 years of age. We do not knowingly
              collect personal information from children. If you believe a child has provided us
              with personal data, please contact us and we will take steps to delete it.
            </p>
          </section>

          <section className="legal-section">
            <h2>9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Changes will be posted on this
              page with an updated "Last updated" date. Continued use of the service after any
              changes constitutes acceptance of the revised policy.
            </p>
          </section>

          <section className="legal-section">
            <h2>10. Contact</h2>
            <p>
              If you have questions or concerns about this Privacy Policy or how your data is
              handled, please contact us at{" "}
              <a href="mailto:privacy@eastapefilms.com" className="legal-link">
                privacy@eastapefilms.com
              </a>
              .
            </p>
          </section>

          <div className="legal-footer-nav">
            <Link to="/terms" className="legal-link">Terms &amp; Conditions →</Link>
            <Link to="/" className="back-link">
              <ArrowLeft size={13} weight="bold" /> Back to Home
            </Link>
          </div>
        </div>
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
