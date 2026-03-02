import { Link } from "react-router-dom";
import { ArrowLeft } from "@phosphor-icons/react";
import SiteHeader from "./SiteHeader";

export default function TermsPage() {
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
            <h1 className="legal-title">Terms &amp; Conditions</h1>
            <p className="legal-meta">Last updated: March 2026</p>
          </div>

          <section className="legal-section">
            <h2>1. Acceptance of Terms</h2>
            <p>
              By accessing or using Eastape Share ("the Service"), you agree to be bound by these
              Terms &amp; Conditions ("Terms"). If you do not agree to these Terms, please do not use
              the Service. These Terms apply to all users of the Service.
            </p>
          </section>

          <section className="legal-section">
            <h2>2. Description of Service</h2>
            <p>
              Eastape Share is a file-sharing platform that allows users to upload files and
              generate shareable download links. The Service is provided by Eastape Films and is
              currently intended for private, authorised use only.
            </p>
          </section>

          <section className="legal-section">
            <h2>3. Acceptable Use</h2>
            <p>You agree to use the Service only for lawful purposes. You must not upload, share, or distribute:</p>
            <ul>
              <li>Content that is illegal under applicable law.</li>
              <li>Malware, viruses, spyware, or any malicious code.</li>
              <li>Copyrighted content you do not have the right to distribute.</li>
              <li>Content that is defamatory, obscene, harassing, or violates the rights of others.</li>
              <li>Personal data of third parties without their consent.</li>
              <li>Content that violates any third-party intellectual property rights.</li>
            </ul>
            <p>
              We reserve the right to remove any content and suspend or terminate access for
              violations of these Terms without prior notice.
            </p>
          </section>

          <section className="legal-section">
            <h2>4. File Ownership &amp; Responsibility</h2>
            <p>
              You retain full ownership of the files you upload. By uploading files, you grant
              Eastape Share a limited, non-exclusive licence to store and serve your files solely
              for the purpose of providing the Service to you.
            </p>
            <p>
              You are solely responsible for the content of files you upload and share. Eastape
              Films accepts no liability for the content uploaded by users.
            </p>
          </section>

          <section className="legal-section">
            <h2>5. File Retention &amp; Deletion</h2>
            <p>
              Uploaded files are stored temporarily and automatically deleted after the retention
              period (typically 7 days). We do not guarantee permanent storage of any files.
              You should retain your own copies of any important files.
            </p>
          </section>

          <section className="legal-section">
            <h2>6. Service Availability</h2>
            <p>
              We endeavour to keep the Service available at all times but do not guarantee
              uninterrupted access. The Service may be temporarily unavailable due to maintenance,
              updates, or circumstances beyond our control. We are not liable for any loss or
              inconvenience caused by service downtime.
            </p>
          </section>

          <section className="legal-section">
            <h2>7. Intellectual Property</h2>
            <p>
              All trademarks, logos, and service marks displayed on the Service belong to Eastape
              Films or their respective owners. Nothing in these Terms grants you any right to use
              our branding or intellectual property without prior written consent.
            </p>
          </section>

          <section className="legal-section">
            <h2>8. Disclaimer of Warranties</h2>
            <p>
              The Service is provided "as is" and "as available" without warranties of any kind,
              either express or implied, including but not limited to implied warranties of
              merchantability, fitness for a particular purpose, or non-infringement. We do not
              warrant that the Service will be error-free, secure, or free of viruses.
            </p>
          </section>

          <section className="legal-section">
            <h2>9. Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by law, Eastape Films shall not be liable for any
              indirect, incidental, special, consequential, or punitive damages arising from your
              use of or inability to use the Service, even if we have been advised of the
              possibility of such damages.
            </p>
          </section>

          <section className="legal-section">
            <h2>10. Privacy</h2>
            <p>
              Your use of the Service is also governed by our{" "}
              <Link to="/privacy" className="legal-link">Privacy Policy</Link>, which is
              incorporated into these Terms by reference.
            </p>
          </section>

          <section className="legal-section">
            <h2>11. Changes to Terms</h2>
            <p>
              We reserve the right to modify these Terms at any time. Updated Terms will be posted
              on this page with a revised "Last updated" date. Your continued use of the Service
              following any changes constitutes acceptance of the new Terms.
            </p>
          </section>

          <section className="legal-section">
            <h2>12. Governing Law</h2>
            <p>
              These Terms shall be governed by and construed in accordance with applicable law.
              Any disputes arising under or in connection with these Terms shall be subject to the
              exclusive jurisdiction of the competent courts.
            </p>
          </section>

          <section className="legal-section">
            <h2>13. Contact</h2>
            <p>
              If you have any questions about these Terms, please contact us at{" "}
              <a href="mailto:legal@eastapefilms.com" className="legal-link">
                legal@eastapefilms.com
              </a>
              .
            </p>
          </section>

          <div className="legal-footer-nav">
            <Link to="/privacy" className="legal-link">Privacy Policy →</Link>
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
