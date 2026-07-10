import { createBrowserRouter } from "react-router-dom";
import { App } from "./App.js";
import { HistoryScreen } from "./screens/HistoryScreen.js";
import { HomeScreen } from "./screens/HomeScreen.js";
import { LobbyBrowserScreen } from "./screens/LobbyBrowserScreen.js";
import { LobbyRoomScreen } from "./screens/LobbyRoomScreen.js";
import { LoginScreen } from "./screens/LoginScreen.js";
import { MultiplayerGameScreen } from "./screens/MultiplayerGameScreen.js";
import { ProfileScreen } from "./screens/ProfileScreen.js";
import { RegisterScreen } from "./screens/RegisterScreen.js";
import { SinglePlayerScreen } from "./screens/SinglePlayerScreen.js";
import { StatsScreen } from "./screens/StatsScreen.js";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <HomeScreen /> },
      { path: "play", element: <SinglePlayerScreen /> },
      { path: "login", element: <LoginScreen /> },
      { path: "register", element: <RegisterScreen /> },
      { path: "lobbies", element: <LobbyBrowserScreen /> },
      { path: "lobby/:lobbyId", element: <LobbyRoomScreen /> },
      { path: "game/:gameId", element: <MultiplayerGameScreen /> },
      { path: "history", element: <HistoryScreen /> },
      { path: "stats", element: <StatsScreen /> },
      { path: "profile", element: <ProfileScreen /> },
    ],
  },
]);
