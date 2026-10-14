import { create } from 'zustand';

import { AudioSource, SoundStatus } from '@nuclearplayer/hifi';

import { eventBus } from '../services/eventBus';
import { Logger } from '../services/logger';
import { secondsToMs } from '../utils/time';

export const SECTION_REPEAT_MIN_SECONDS = 0.25;

export const isValidSectionRepeatRange = (
  start: number,
  end: number,
  duration: number,
): boolean =>
  Number.isFinite(start) &&
  Number.isFinite(end) &&
  Number.isFinite(duration) &&
  duration > 0 &&
  start >= 0 &&
  end <= duration &&
  end - start + 1e-9 >= SECTION_REPEAT_MIN_SECONDS;

type SectionRepeat = {
  start: number | null;
  end: number | null;
};

type SoundState = {
  src: AudioSource | null;
  status: SoundStatus;
  seek: number;
  duration: number;
  crossfadeMs: number;
  preload: 'none' | 'metadata' | 'auto';
  crossOrigin: '' | 'anonymous' | 'use-credentials';
  sectionRepeat: SectionRepeat;
};

type SoundActions = {
  setSrc: (src: AudioSource | null) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  toggle: () => void;
  seekTo: (seconds: number) => void;
  updatePlayback: (position: number, duration: number) => void;
  setSectionStart: (seconds?: number) => boolean;
  setSectionEnd: (seconds?: number) => boolean;
  clearSectionRepeat: () => void;
  setCrossfadeMs: (ms: number) => void;
  setPreload: (mode: 'none' | 'metadata' | 'auto') => void;
  setCrossOrigin: (v: '' | 'anonymous' | 'use-credentials') => void;
};

export const useSoundStore = create<SoundState & SoundActions>((set, get) => ({
  src: null,
  status: 'stopped',
  seek: 0,
  duration: 0,
  crossfadeMs: 0,
  preload: 'auto',
  crossOrigin: '',
  sectionRepeat: { start: null, end: null },
  setSrc: (src) => {
    set({
      src,
      seek: 0,
      duration: 0,
      sectionRepeat: { start: null, end: null },
    });
    Logger.playback.debug(`Set source: ${src?.url ?? 'null'}`);
  },
  play: () => {
    set({ status: 'playing' });
    Logger.playback.debug('Play');
  },
  pause: () => {
    set({ status: 'paused' });
    Logger.playback.debug('Pause');
  },
  stop: () => {
    set({
      status: 'stopped',
      seek: 0,
      sectionRepeat: { start: null, end: null },
    });
    Logger.playback.debug('Stop');
  },
  toggle: () => {
    const { status } = get();
    if (status === 'playing') {
      get().pause();
    } else {
      get().play();
    }
  },
  seekTo: (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) {
      return;
    }
    const { seek, duration, sectionRepeat } = get();
    let target = duration > 0 ? Math.min(seconds, duration) : seconds;
    if (
      sectionRepeat.start !== null &&
      sectionRepeat.end !== null &&
      (target < sectionRepeat.start || target >= sectionRepeat.end)
    ) {
      target = sectionRepeat.start;
    }
    eventBus.emit('playbackSeeked', {
      fromMs: secondsToMs(seek),
      toMs: secondsToMs(target),
    });
    set({ seek: target });
  },
  updatePlayback: (position, duration) => {
    const { sectionRepeat } = get();
    const nextDuration =
      Number.isFinite(duration) && duration > 0 ? duration : 0;
    const sectionInvalid =
      sectionRepeat.start !== null &&
      !isValidSectionRepeatRange(
        sectionRepeat.start,
        sectionRepeat.end ?? nextDuration,
        nextDuration,
      );
    set({
      seek: Number.isFinite(position) ? Math.max(0, position) : get().seek,
      duration: nextDuration,
      ...(sectionInvalid && { sectionRepeat: { start: null, end: null } }),
    });
  },
  setSectionStart: (seconds = get().seek) => {
    const { src, duration } = get();
    if (!src || !isValidSectionRepeatRange(seconds, duration, duration)) {
      return false;
    }
    set({ sectionRepeat: { start: seconds, end: null } });
    return true;
  },
  setSectionEnd: (seconds = get().seek) => {
    const { src, duration, sectionRepeat } = get();
    if (
      !src ||
      sectionRepeat.start === null ||
      !isValidSectionRepeatRange(sectionRepeat.start, seconds, duration)
    ) {
      return false;
    }
    set({ sectionRepeat: { start: sectionRepeat.start, end: seconds } });
    return true;
  },
  clearSectionRepeat: () => set({ sectionRepeat: { start: null, end: null } }),
  setCrossfadeMs: (ms) => set({ crossfadeMs: ms }),
  setPreload: (mode) => set({ preload: mode }),
  setCrossOrigin: (v) => set({ crossOrigin: v }),
}));
