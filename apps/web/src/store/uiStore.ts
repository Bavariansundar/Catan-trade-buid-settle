import { create } from "zustand";

/**
 * Cross-cutting UI chrome state. `immersive` is set by the game screens
 * while a game is actually being played (not on the setup form), and the
 * app shell hides its header in response — see docs/architecture/mobile-ux.md.
 */
interface UiState {
  readonly immersive: boolean;
  setImmersive: (on: boolean) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  immersive: false,
  setImmersive: (on) => set({ immersive: on }),
}));
