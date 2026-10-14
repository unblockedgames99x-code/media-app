import { act, render, screen } from '@testing-library/react';

import { SoundProvider } from '../components/SoundProvider';
import { playbackManager } from '../services/playback';
import { useQueueStore } from '../stores/queueStore';
import { useSoundStore } from '../stores/soundStore';
import { createQueueItem } from '../test/fixtures/queue';

export const SectionRepeatWrapper = {
  mount() {
    useQueueStore.setState({
      items: [createQueueItem('First song'), createQueueItem('Second song')],
      currentIndex: 0,
      isReady: true,
      isLoading: false,
    });
    return render(<SoundProvider />);
  },

  get audio() {
    return screen.getByTestId<HTMLAudioElement>('music-audio');
  },

  get section() {
    return useSoundStore.getState().sectionRepeat;
  },

  get currentTitle() {
    return useQueueStore.getState().getCurrentItem()?.track.title;
  },

  playTrack(url = '/song.mp3', duration = 120) {
    const item = useQueueStore.getState().getCurrentItem()!;
    act(() => {
      playbackManager.startTrack(
        item,
        { url, protocol: 'http' },
        { autoPlay: true },
      );
    });
    this.canPlay(duration);
  },

  canPlay(duration: number) {
    act(() => {
      Object.defineProperty(this.audio, 'readyState', {
        value: 4,
        configurable: true,
      });
      Object.defineProperty(this.audio, 'duration', {
        value: duration,
        configurable: true,
      });
      this.audio.dispatchEvent(new Event('canplay'));
    });
  },

  position(seconds: number) {
    act(() => {
      this.audio.currentTime = seconds;
      this.audio.dispatchEvent(new Event('timeupdate'));
    });
  },

  start(seconds?: number) {
    let accepted = false;
    act(() => {
      accepted = useSoundStore.getState().setSectionStart(seconds);
    });
    return accepted;
  },

  end(seconds?: number) {
    let accepted = false;
    act(() => {
      accepted = useSoundStore.getState().setSectionEnd(seconds);
    });
    return accepted;
  },

  clear() {
    act(() => useSoundStore.getState().clearSectionRepeat());
  },

  pause() {
    act(() => playbackManager.pause());
  },

  resume() {
    act(() => playbackManager.play());
  },

  stop() {
    act(() => useSoundStore.getState().stop());
  },

  seek(seconds: number) {
    act(() => useSoundStore.getState().seekTo(seconds));
  },

  finish() {
    act(() => {
      this.audio.currentTime = this.audio.duration;
      Object.defineProperty(this.audio, 'ended', {
        value: true,
        configurable: true,
      });
      Object.defineProperty(this.audio, 'paused', {
        value: true,
        configurable: true,
      });
      this.audio.dispatchEvent(new Event('ended'));
    });
  },

  next() {
    act(() => useQueueStore.getState().goToNext());
  },

  changeCurrentItem() {
    act(() => useQueueStore.setState({ currentIndex: 1 }));
  },

  changeDuration(duration: number) {
    act(() => {
      Object.defineProperty(this.audio, 'duration', {
        value: duration,
        configurable: true,
      });
      this.audio.dispatchEvent(new Event('durationchange'));
    });
  },
};
