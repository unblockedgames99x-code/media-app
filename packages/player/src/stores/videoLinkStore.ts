import { create } from 'zustand';

type VideoLinkState = {
  pending: { path: string; sequence: number } | null;
  sequence: number;
  request: (path: string) => void;
  complete: (sequence: number) => void;
};

export const useVideoLinkStore = create<VideoLinkState>((set) => ({
  pending: null,
  sequence: 0,
  request: (path) =>
    set((state) => ({
      sequence: state.sequence + 1,
      pending: { path, sequence: state.sequence + 1 },
    })),
  complete: (sequence) =>
    set((state) =>
      state.pending?.sequence === sequence ? { pending: null } : state,
    ),
}));
