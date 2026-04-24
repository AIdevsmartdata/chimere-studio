"use client";

import { create } from 'zustand';

export type ArtifactKind = 'python' | 'mermaid' | 'javascript';

export type Artifact = {
  id: string;
  kind: ArtifactKind;
  title: string;
  source: string;
  createdAt: number;
};

type ArtifactsState = {
  artifacts: Artifact[];
  activeId: string | null;
  panelOpen: boolean;
  addArtifact: (a: Omit<Artifact, 'id' | 'createdAt'>) => string;
  setActive: (id: string | null) => void;
  togglePanel: () => void;
  closePanel: () => void;
  clear: () => void;
};

export const useArtifactsStore = create<ArtifactsState>((set) => ({
  artifacts: [],
  activeId: null,
  panelOpen: false,
  addArtifact: (a) => {
    const id = `art_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const full: Artifact = { ...a, id, createdAt: Date.now() };
    set((s) => ({
      artifacts: [...s.artifacts, full],
      activeId: id,
      panelOpen: true,
    }));
    return id;
  },
  setActive: (id) => set({ activeId: id, panelOpen: id !== null }),
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  closePanel: () => set({ panelOpen: false, activeId: null }),
  clear: () => set({ artifacts: [], activeId: null, panelOpen: false }),
}));
