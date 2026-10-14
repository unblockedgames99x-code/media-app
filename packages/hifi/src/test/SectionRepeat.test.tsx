import { cleanup } from '@testing-library/react';

import { SectionRepeatAudioWrapper as SectionRepeat } from './SectionRepeat.test-wrapper';

describe('Section repeat native audio boundaries', () => {
  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('seeks short sections directly even though they are below the normal seek threshold', () => {
    SectionRepeat.mount();
    expect(SectionRepeat.audio.currentTime).toBe(10);
    SectionRepeat.move(10.25);
    SectionRepeat.update();
    expect(SectionRepeat.audio.currentTime).toBe(10);
    SectionRepeat.move(10.25);
    SectionRepeat.update();
    expect(SectionRepeat.audio.currentTime).toBe(10);
  });

  it('uses a boundary timer even between browser time updates', () => {
    SectionRepeat.mount();
    SectionRepeat.move(10.25);
    SectionRepeat.advance(250);
    expect(SectionRepeat.audio.currentTime).toBe(10);
    expect(SectionRepeat.audio.paused).toBe(false);
  });

  it('does not run boundary timers while paused', () => {
    SectionRepeat.mount(undefined, 'paused');
    SectionRepeat.move(10.25);
    SectionRepeat.advance(1000);
    expect(SectionRepeat.audio.currentTime).toBe(10.25);
    expect(SectionRepeat.audio.paused).toBe(true);
  });

  it('corrects an out-of-range native seek without starting paused audio', () => {
    SectionRepeat.mount({ start: 10, end: 30 }, 'paused');
    SectionRepeat.move(5);
    SectionRepeat.seeked();
    expect(SectionRepeat.audio.currentTime).toBe(10);
    expect(SectionRepeat.audio.paused).toBe(true);
    SectionRepeat.move(20);
    SectionRepeat.seeked();
    expect(SectionRepeat.audio.currentTime).toBe(20);
  });

  it('removes the pending boundary timer when the audio is unmounted', () => {
    const result = SectionRepeat.mount();
    const audio = SectionRepeat.audio;
    result.unmount();
    audio.currentTime = 10.25;
    SectionRepeat.advance(1000);
    expect(audio.currentTime).toBe(10.25);
  });
});
