/**
 * VersionsPanel — lists all versions of an asset, allows uploading a new version.
 */
import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CloudArrowUp, CheckCircle } from "@phosphor-icons/react";
import UploadPanel from "./UploadPanel";
import { userApiFetch, formatSize } from "../../lib/userApi";

export default function VersionsPanel({ asset, onVersionUploaded }) {
  const [versions,    setVersions]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showUpload,  setShowUpload]  = useState(false);

  useEffect(() => {
    userApiFetch(`/api/media/assets?id=${asset.id}`)
      .then(d => setVersions(d.asset?.media_asset_versions || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [asset.id]);

  async function handleVersionUploaded(newAsset) {
    try {
      // Bump version and transfer new video details to original asset
      const d = await userApiFetch(`/api/media/assets?id=${asset.id}`, {
        method: "PUT",
        body: JSON.stringify({
          version_bump:        true,
          bunny_video_guid:    newAsset.bunny_video_guid,
          bunny_video_status:  newAsset.bunny_video_status,
          bunny_playback_url:  newAsset.bunny_playback_url,
          bunny_thumbnail_url: newAsset.bunny_thumbnail_url,
          duration:            newAsset.duration || null,
        }),
      });
      // Delete the temporary duplicate asset created by UploadPanel
      if (newAsset.id && newAsset.id !== asset.id) {
        await userApiFetch(`/api/media/assets?id=${newAsset.id}`, { method: "DELETE" }).catch(() => {});
      }
      // Refresh versions list
      const refreshed = await userApiFetch(`/api/media/assets?id=${asset.id}`);
      setVersions(refreshed.asset?.media_asset_versions || []);
      onVersionUploaded?.(d.asset);
    } catch (err) { alert("Version upload failed: " + err.message); }
    setShowUpload(false);
  }

  return (
    <div className="versions-panel">
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
        <span style={{ fontSize: 13, color: "var(--t2)" }}>
          Current: <strong style={{ color: "var(--t1)" }}>v{asset.version}</strong>
        </span>
        <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setShowUpload(true)}>
          <CloudArrowUp size={13} /> Upload v{asset.version + 1}
        </button>
      </div>

      {loading ? (
        <div className="empty-state" style={{ padding: "24px 0" }}><span className="spinner" /></div>
      ) : (
        <div className="versions-list">
          {/* Current version */}
          <div className="version-item active">
            <span className="version-badge">v{asset.version} — Current</span>
            <span style={{ fontSize: 12, color: "var(--t3)" }}>
              {asset.created_at ? new Date(asset.created_at).toLocaleDateString() : ""}
            </span>
          </div>

          {/* Previous versions */}
          {versions
            .filter(v => v.version_number < asset.version)
            .sort((a, b) => b.version_number - a.version_number)
            .map(v => (
              <div key={v.id} className="version-item">
                <span className="version-badge past">v{v.version_number}</span>
                <span style={{ fontSize: 12, color: "var(--t3)" }}>
                  {v.created_at ? new Date(v.created_at).toLocaleDateString() : ""}
                </span>
                {v.bunny_thumbnail_url && (
                  <img
                    src={v.bunny_thumbnail_url}
                    alt={`v${v.version_number}`}
                    style={{ width: 60, height: 36, objectFit: "cover", borderRadius: 4 }}
                  />
                )}
              </div>
            ))
          }

          {versions.length === 0 && (
            <p style={{ color: "var(--t3)", fontSize: 12, padding: "8px 0" }}>
              No previous versions. Upload a new version above.
            </p>
          )}
        </div>
      )}

      {showUpload && (
        <UploadPanel
          projectId={asset.project_id}
          folderId={asset.folder_id}
          onClose={() => setShowUpload(false)}
          onUploaded={handleVersionUploaded}
        />
      )}
    </div>
  );
}
