import { act, render, RenderResult, screen } from '@testing-library/react';

import { Sound } from '../Sound';
import { SectionRepeatRange, SoundStatus } from '../types';

export const SectionRepeatAudioWrapper = {
  mount(
    range: SectionRepeatRange = { start: 10, end: 10.25 },
    status: SoundStatus = 'playing',
  ): RenderResult {
    const result = render(
      <Sound
        src={{ url: '/song.mp3', protocol: 'http' }}
        status={status}
        sectionRepeat={range}
      />,
    );
    act(() => {
      Object.defineProperty(this.audio, 'duration', {
        value: 120,
        configurable: true,
      });
      Object.defineProperty(this.audio, 'readyState', {
        value: 4,
        configurable: true,
      });
      this.audio.dispatchEvent(new Event('canplay'));
    });
    return result;
  },

  get audio() {
    return screen.getByTestId<HTMLAudioElement>('music-audio');
  },

  move(seconds: number) {
    this.audio.currentTime = seconds;
  },

  update() {
    act(() => this.audio.dispatchEvent(new Event('timeupdate')));
  },

  seeked() {
    act(() => this.audio.dispatchEvent(new Event('seeked')));
  },

  advance(milliseconds: number) {
    act(() => vi.advanceTimersByTime(milliseconds));
  },
};
