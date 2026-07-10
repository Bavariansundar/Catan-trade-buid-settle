import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiRequestError } from "../api/client.js";
import {
  createLobby,
  joinLobbyByCode,
  joinLobbyById,
  listPublicLobbies,
  type Lobby,
} from "../api/lobby.js";
import { useAuthStore } from "../store/authStore.js";

export function LobbyBrowserScreen() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const navigate = useNavigate();
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [code, setCode] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    listPublicLobbies(accessToken)
      .then(setLobbies)
      .catch(() => undefined);
  }, [accessToken]);

  if (!accessToken) return <div className="hh-card">Sign in to browse lobbies.</div>;

  async function handleCreate() {
    setError(null);
    try {
      const lobby = await createLobby(accessToken!, {
        isPublic,
        targetVictoryPoints: 10,
        enabledModuleIds: [],
      });
      void navigate(`/lobby/${lobby.id}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not create lobby");
    }
  }

  async function handleJoin(lobbyId: string) {
    setError(null);
    try {
      await joinLobbyById(accessToken!, lobbyId);
      void navigate(`/lobby/${lobbyId}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not join lobby");
    }
  }

  async function handleJoinByCode() {
    setError(null);
    try {
      const lobby = await joinLobbyByCode(accessToken!, code.trim());
      void navigate(`/lobby/${lobby.id}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "No lobby with that code");
    }
  }

  return (
    <div
      style={{
        maxWidth: 640,
        margin: "2rem auto",
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
      }}
    >
      <h2>Lobbies</h2>
      {error && <div style={{ color: "var(--hh-danger)" }}>{error}</div>}

      <div
        className="hh-card"
        style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
          />
          Public
        </label>
        <button type="button" className="hh-button" onClick={() => void handleCreate()}>
          Create Lobby
        </button>
        <span style={{ marginLeft: "auto" }} />
        <input
          className="hh-input"
          placeholder="Invite code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          style={{ width: 120 }}
        />
        <button
          type="button"
          className="hh-button hh-button--secondary"
          onClick={() => void handleJoinByCode()}
        >
          Join by Code
        </button>
      </div>

      <div className="hh-card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <h3 style={{ fontSize: "1rem" }}>Public Lobbies</h3>
        {lobbies.length === 0 && (
          <div style={{ color: "var(--hh-text-dim)" }}>No public lobbies waiting right now.</div>
        )}
        {lobbies.map((lobby) => (
          <div
            key={lobby.id}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
          >
            <span>
              {lobby.seats.length} seat(s) · {lobby.targetVictoryPoints} VP
            </span>
            <button
              type="button"
              className="hh-button hh-button--secondary"
              onClick={() => void handleJoin(lobby.id)}
            >
              Join
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
