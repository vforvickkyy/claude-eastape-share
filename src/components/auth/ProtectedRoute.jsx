import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", background: "#0a0a0f",
      }}>
        <span className="spinner" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Edge-case safety net: user object exists but email was never confirmed
  if (!user.email_confirmed_at) {
    return <Navigate to="/verify-otp" state={{ email: user.email }} replace />;
  }

  return children;
}
