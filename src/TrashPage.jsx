import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash } from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";
import DashboardLayout from "./DashboardLayout";
import FileList from "./components/FileList";
import { userApiFetch } from "./lib/userApi";

export default function TrashPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [shares, setShares]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login", { replace: true });
  }, [user, authLoading]);

  useEffect(() => {
    if (!user) return;
    userApiFetch("/api/user/files?trash=true")
      .then(d => setShares(d.shares || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  async function handleRestore(token) {
    await userApiFetch(`/api/user/share/${token}`, { method: "PUT", body: JSON.stringify({ action: "restore" }) });
    setShares(s => s.filter(sh => sh.token !== token));
  }

  async function handleDelete({ token }) {
    if (!window.confirm("Permanently delete? This cannot be undone.")) return;
    await userApiFetch(`/api/user/share/${token}`, { method: "DELETE" });
    setShares(s => s.filter(sh => sh.token !== token));
  }

  return (
    <DashboardLayout title="Trash">
      {loading ? (
        <div className="empty-state"><span className="spinner" /></div>
      ) : shares.length === 0 ? (
        <div className="empty-state">
          <Trash size={40} weight="thin" />
          <p>Trash is empty</p>
        </div>
      ) : (
        <FileList
          shares={shares}
          folders={[]}
          isTrash
          onRestore={handleRestore}
          onDelete={handleDelete}
        />
      )}
    </DashboardLayout>
  );
}
