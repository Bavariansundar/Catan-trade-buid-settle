import { create } from "zustand";
import { persist } from "zustand/middleware";
import { apiRequest } from "../api/client.js";

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
}

interface AuthResponseBody {
  readonly user: AuthUser;
  readonly accessToken: string;
  readonly refreshToken: string;
}

interface AuthState {
  readonly user: AuthUser | null;
  readonly accessToken: string | null;
  readonly refreshToken: string | null;
  readonly register: (email: string, password: string, displayName: string) => Promise<void>;
  readonly login: (email: string, password: string) => Promise<void>;
  readonly logout: () => Promise<void>;
  /** Refreshes the access token; returns the new token, or null if the refresh token is no longer valid. */
  readonly ensureFreshAccessToken: () => Promise<string | null>;
}

function applyAuthResponse(body: AuthResponseBody) {
  return { user: body.user, accessToken: body.accessToken, refreshToken: body.refreshToken };
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,

      async register(email, password, displayName) {
        const body = await apiRequest<AuthResponseBody>("/auth/register", {
          method: "POST",
          body: { email, password, displayName },
        });
        set(applyAuthResponse(body));
      },

      async login(email, password) {
        const body = await apiRequest<AuthResponseBody>("/auth/login", {
          method: "POST",
          body: { email, password },
        });
        set(applyAuthResponse(body));
      },

      async logout() {
        const { refreshToken } = get();
        if (refreshToken) {
          await apiRequest("/auth/logout", { method: "POST", body: { refreshToken } }).catch(
            () => undefined,
          );
        }
        set({ user: null, accessToken: null, refreshToken: null });
      },

      async ensureFreshAccessToken() {
        const { refreshToken } = get();
        if (!refreshToken) return null;
        try {
          const body = await apiRequest<AuthResponseBody>("/auth/refresh", {
            method: "POST",
            body: { refreshToken },
          });
          set(applyAuthResponse(body));
          return body.accessToken;
        } catch {
          set({ user: null, accessToken: null, refreshToken: null });
          return null;
        }
      },
    }),
    { name: "hexhaven-auth" },
  ),
);
