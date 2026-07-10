import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore.js";

export function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  if (!user) return <div className="hh-card">Sign in to view your profile.</div>;

  return (
    <div
      className="hh-card"
      style={{
        maxWidth: 420,
        margin: "3rem auto",
        display: "flex",
        flexDirection: "column",
        gap: "0.8rem",
      }}
    >
      <h2>Profile</h2>
      <div>
        <strong>{user.displayName}</strong>
      </div>
      <div style={{ color: "var(--hh-text-dim)" }}>{user.email}</div>
      <button
        type="button"
        className="hh-button hh-button--secondary"
        onClick={() => {
          void logout().then(() => navigate("/"));
        }}
      >
        Sign Out
      </button>
    </div>
  );
}
