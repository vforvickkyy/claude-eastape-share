import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CloudArrowUp, Files, HardDrive, LinkSimple } from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";
import DashboardLayout from "./DashboardLayout";
import FileGrid from "./components/FileGrid";
import { userApiFetch, formatSize, totalShareSize } from "./lib/userApi";

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [shares, setShares]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login", { replace: true });
  }, [user, authLoading]);

  useEffect(() => {
    if (!user) return;
    userApiFetch("/api/user/files?limit=6")
      .then(d => setShares(d.shares || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  const totalFiles   = shares.reduce((s, sh) => s + (sh.files?.length || 0), 0);
  const totalStorage = shares.reduce((s, sh) => s + totalShareSize(sh), 0);
  const activeLinks  = shares.filter(sh => new Date(sh.expires_at) > new Date()).length;

  return (
    <DashboardLayout title="Dashboard">
      <div className="db-section">
        {/* Stats */}
        <div className="stats-bar">
          <div className="stat-card">
            <Files size={22} weight="duotone" className="stat-icon" />
            <div>
              <span className="stat-value">{totalFiles}</span>
              <span className="stat-label">Files</span>
            </div>
          </div>
          <div className="stat-card">
            <HardDrive size={22} weight="duotone" className="stat-icon" />
            <div>
              <span className="stat-value">{formatSize(totalStorage)}</span>
              <span className="stat-label">Storage used</span>
            </div>
          </div>
          <div className="stat-card">
            <LinkSimple size={22} weight="duotone" className="stat-icon" />
            <div>
              <span className="stat-value">{activeLinks}</span>
              <span className="stat-label">Active links</span>
            </div>
          </div>
        </div>

        {/* Recent uploads */}
        <div className="db-section-header">
          <h2 className="db-section-title">Recent Uploads</h2>
          <button className="btn-ghost" onClick={() => navigate("/my-files")}>View all</button>
        </div>

        {loading ? (
          <div className="empty-state"><span className="spinner" /></div>
        ) : shares.length === 0 ? (
          <div className="empty-state">
            <CloudArrowUp size={40} weight="thin" />
            <p>No uploads yet</p>
            <button className="btn-primary-sm" onClick={() => navigate("/")}>Upload files</button>
          </div>
        ) : (
          <FileGrid
            shares={shares}
            folders={[]}
            onTrash={async token => {
              await userApiFetch(`/api/user/share/${token}`, { method: "PUT", body: JSON.stringify({ action: "trash" }) });
              setShares(s => s.filter(sh => sh.token !== token));
            }}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
