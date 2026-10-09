import { create } from 'zustand';

type DefaultSourcesState = {
  phase: 'idle' | 'installing' | 'ready' | 'error';
  source?: string;
};

export const useDefaultSourcesStore = create<DefaultSourcesState>(() => ({
  phase: 'idle',
}));
