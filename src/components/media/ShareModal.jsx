/**
 * ShareModal — generate / manage a share link for a media asset.
 */
import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link, Copy, CheckCircle, Trash, X } from "@phosphor-icons/react";
import { userApiFetch } from "../../lib/userApi";

export default function ShareModal({ asset, onClose }) {
  const [links,       setLinks]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [generating,  setGenerating]  = useState(false);
  const [copied,      setCopied]      = useState(null);

  // Options for new link
  const [allowDownload, setAllowDownload] = useState(true);
  const [allowComments, setAllowComments] = useState(false);
  const [expiresAt,     setExpiresAt]     = useState("");
  const [password,      setPassword]      = useState("");

  useEffect(() => {
    userApiFetch(`/api/media/share?assetId=${asset.id}`)
      .then(d => setLinks(d.links || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [asset.id]);

  async function generate() {
    setGenerating(true);
    try {
      const data = await userApiFetch("/api/media/share", {
        method: "POST",
        body: JSON.stringify({
          assetId:      asset.id,
          allowDownload,
          allowComments,
          expiresAt:    expiresAt || null,
          password:     password  || null,
        }),
      });
      setLinks(ls => [data.link, ...ls]);
    } catch (err) { console.error(err); }
    finally { setGenerating(false); }
  }

  async function revoke(id) {
    await userApiFetch(`/api/media/share?id=${id}`, { method: "DELETE" });
    setLinks(ls => ls.filter(l => l.id !== id));
  }

  function getUrl(token) {
    return `${window.location.origin}/media/share/${token}`;
  }

  async function copy(token) {
    await navigator.clipboard.writeText(getUrl(token));
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="modal-card glass-card"
        style={{ maxWidth: 440 }}
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.94, opacity: 0 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <Link size={18} weight="duotone" />
          Share "{asset.name}"
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        {/* New link options */}
        <div className="share-modal-options">
          <label className="share-toggle">
            <span>Allow download</span>
            <input type="checkbox" checked={allowDownload} onChange={e => setAllowDownload(e.target.checked)} />
          </label>
          <label className="share-toggle">
            <span>Allow comments</span>
            <input type="checkbox" checked={allowComments} onChange={e => setAllowComments(e.target.checked)} />
          </label>
          <div className="form-group" style={{ marginTop: 8 }}>
            <label className="form-label">Password (optional)</label>
            <input
              className="form-input"
              type="password"
              placeholder="Leave blank for no password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ marginTop: 8 }}>
            <label className="form-label">Expires (optional)</label>
            <input
              className="form-input"
              type="datetime-local"
              value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)}
            />
          </div>
          <button
            className="btn-primary-sm"
            style={{ marginTop: 12, width: "100%", justifyContent: "center" }}
            onClick={generate}
            disabled={generating}
          >
            {generating ? <><span className="spinner" /> Generating…</> : <><Link size={13} /> Generate Link</>}
          </button>
        </div>

        {/* Existing links */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "12px 0" }}><span className="spinner" /></div>
        ) : links.length > 0 && (
          <div className="share-links-list">
            <p style={{ fontSize: 12, color: "var(--t3)", marginBottom: 8 }}>Existing links</p>
            {links.map(l => (
              <div key={l.id} className="share-link-row">
                <input
                  className="share-input"
                  readOnly
                  value={getUrl(l.token)}
                  onFocus={e => e.target.select()}
                />
                <button
                  className={`copy-btn ${copied === l.token ? "copied" : ""}`}
                  onClick={() => copy(l.token)}
                >
                  {copied === l.token ? <CheckCircle size={13} /> : <Copy size={13} />}
                </button>
                <button className="icon-btn danger" onClick={() => revoke(l.id)}>
                  <Trash size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
