import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ApiRequestError } from "../api/client.js";
import { useAuthStore } from "../store/authStore.js";

export function RegisterScreen() {
  const register = useAuthStore((s) => s.register);
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(email, password, displayName);
      void navigate("/lobbies");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="hh-card"
      style={{
        maxWidth: 360,
        margin: "4rem auto",
        display: "flex",
        flexDirection: "column",
        gap: "0.8rem",
      }}
    >
      <h2>Create Account</h2>
      {error && <div style={{ color: "var(--hh-danger)" }}>{error}</div>}
      <input
        className="hh-input"
        placeholder="Display name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        required
      />
      <input
        className="hh-input"
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        className="hh-input"
        type="password"
        placeholder="Password (min 8 characters)"
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <button type="submit" className="hh-button" disabled={busy}>
        {busy ? "Creating…" : "Create Account"}
      </button>
      <Link to="/login">Already have an account? Sign in</Link>
    </form>
  );
}
