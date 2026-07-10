import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ApiRequestError } from "../api/client.js";
import { useAuthStore } from "../store/authStore.js";

export function LoginScreen() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      void navigate("/lobbies");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Login failed");
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
      <h2>Sign In</h2>
      {error && <div style={{ color: "var(--hh-danger)" }}>{error}</div>}
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
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <button type="submit" className="hh-button" disabled={busy}>
        {busy ? "Signing in…" : "Sign In"}
      </button>
      <Link to="/register">Need an account? Register</Link>
    </form>
  );
}
