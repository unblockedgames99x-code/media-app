import { cleanup } from '@testing-library/react';

import { eventBus } from '../services/eventBus';
import { useSettingsStore } from '../stores/settingsStore';
import { useSoundStore } from '../stores/soundStore';
import { SectionRepeatWrapper as SectionRepeat } from './SectionRepeat.test-wrapper';

describe('Music section repeat playback', () => {
  beforeEach(() => {
    useSoundStore.setState(useSoundStore.getInitialState(), true);
    useSettingsStore.setState({ values: {} });
  });

  afterEach(cleanup);

  it('loops the real audio from B to A repeatedly without changing songs', () => {
    const trackFinished = vi.fn();
    const unsubscribe = eventBus.on('trackFinished', trackFinished);
    SectionRepeat.mount();
    SectionRepeat.playTrack();
    SectionRepeat.position(12);
    expect(SectionRepeat.start()).toBe(true);
    SectionRepeat.position(20);
    expect(SectionRepeat.end()).toBe(true);
    expect(SectionRepeat.audio.currentTime).toBe(12);

    SectionRepeat.position(19.9);
    expect(SectionRepeat.audio.currentTime).toBe(19.9);
    SectionRepeat.position(20);
    expect(SectionRepeat.audio.currentTime).toBe(12);
    SectionRepeat.position(20.15);
    expect(SectionRepeat.audio.currentTime).toBe(12);
    expect(useSoundStore.getState().seek).toBe(12);
    expect(SectionRepeat.currentTitle).toBe('First song');
    expect(SectionRepeat.audio.paused).toBe(false);
    expect(trackFinished).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('does not loop with only A set and clears the old B when A changes', () => {
    SectionRepeat.mount();
    SectionRepeat.playTrack();
    SectionRepeat.start(10);
    SectionRepeat.position(30);
    expect(SectionRepeat.audio.currentTime).toBe(30);
    SectionRepeat.end(40);
    SectionRepeat.start(15);
    expect(SectionRepeat.section).toEqual({ start: 15, end: null });
    SectionRepeat.position(45);
    expect(SectionRepeat.audio.currentTime).toBe(45);
  });

  it('keeps paused selection paused and loops after resuming', () => {
    SectionRepeat.mount();
    SectionRepeat.playTrack();
    SectionRepeat.pause();
    SectionRepeat.position(30);
    SectionRepeat.start(10);
    SectionRepeat.end(30);
    expect(SectionRepeat.audio.currentTime).toBe(10);
    expect(SectionRepeat.audio.paused).toBe(true);
    expect(useSoundStore.getState().status).toBe('paused');

    SectionRepeat.resume();
    expect(SectionRepeat.audio.paused).toBe(false);
    SectionRepeat.position(30);
    expect(SectionRepeat.audio.currentTime).toBe(10);
  });

  it('keeps seeks inside the selected range and ignores invalid seeks', () => {
    SectionRepeat.mount();
    SectionRepeat.playTrack();
    SectionRepeat.start(10);
    SectionRepeat.end(30);
    SectionRepeat.seek(20);
    expect(SectionRepeat.audio.currentTime).toBe(20);
    SectionRepeat.seek(80);
    expect(SectionRepeat.audio.currentTime).toBe(10);
    SectionRepeat.seek(-1);
    SectionRepeat.seek(Number.NaN);
    expect(SectionRepeat.audio.currentTime).toBe(10);
  });

  it('loops at the actual end of the song without queue advancement', () => {
    SectionRepeat.mount();
    SectionRepeat.playTrack('/song.mp3', 45);
    SectionRepeat.start(40);
    SectionRepeat.end(45);
    SectionRepeat.finish();
    expect(SectionRepeat.audio.currentTime).toBe(40);
    expect(SectionRepeat.audio.paused).toBe(false);
    expect(SectionRepeat.currentTitle).toBe('First song');
  });

  it('restores normal queue advancement when the section is cleared', () => {
    SectionRepeat.mount();
    SectionRepeat.playTrack();
    SectionRepeat.start(10);
    SectionRepeat.end(30);
    SectionRepeat.clear();
    SectionRepeat.position(30);
    expect(SectionRepeat.audio.currentTime).toBe(30);
    SectionRepeat.finish();
    expect(SectionRepeat.currentTitle).toBe('Second song');
  });

  it('preserves normal whole-song repeat after the section is cleared', () => {
    SectionRepeat.mount();
    SectionRepeat.playTrack();
    useSettingsStore.setState({ values: { 'core.playback.repeat': 'one' } });
    SectionRepeat.start(10);
    SectionRepeat.end(30);
    SectionRepeat.clear();
    SectionRepeat.finish();
    expect(SectionRepeat.currentTitle).toBe('First song');
    expect(SectionRepeat.audio.currentTime).toBe(0);
  });

  it('clears the section immediately when the queue changes before resolution', () => {
    SectionRepeat.mount();
    SectionRepeat.playTrack();
    SectionRepeat.start(10);
    SectionRepeat.end(30);
    SectionRepeat.next();
    expect(SectionRepeat.section).toEqual({ start: null, end: null });
    expect(SectionRepeat.currentTitle).toBe('Second song');
    SectionRepeat.playTrack('/second.mp3');
    SectionRepeat.position(35);
    expect(SectionRepeat.audio.currentTime).toBe(35);
  });

  it('clears the section on source replacement and stop', () => {
    SectionRepeat.mount();
    SectionRepeat.playTrack();
    SectionRepeat.start(10);
    SectionRepeat.end(30);
    SectionRepeat.playTrack('/replacement.mp3');
    expect(SectionRepeat.section).toEqual({ start: null, end: null });
    SectionRepeat.start(5);
    SectionRepeat.end(20);
    SectionRepeat.stop();
    expect(SectionRepeat.section).toEqual({ start: null, end: null });
    expect(SectionRepeat.audio.currentTime).toBe(0);
  });

  it('clears the section when current item identity changes without a new source', () => {
    SectionRepeat.mount();
    SectionRepeat.playTrack();
    SectionRepeat.start(10);
    SectionRepeat.end(30);
    SectionRepeat.changeCurrentItem();
    expect(SectionRepeat.section).toEqual({ start: null, end: null });
    expect(useSoundStore.getState().src?.url).toBe('/song.mp3');
  });

  it('rejects unknown duration, invalid endpoints, and an empty section', () => {
    SectionRepeat.mount();
    SectionRepeat.playTrack('/live.mp3', Number.POSITIVE_INFINITY);
    expect(SectionRepeat.start(10)).toBe(false);
    SectionRepeat.changeDuration(120);
    expect(SectionRepeat.start(-1)).toBe(false);
    expect(SectionRepeat.start(Number.NaN)).toBe(false);
    expect(SectionRepeat.start(120)).toBe(false);
    expect(SectionRepeat.end(20)).toBe(false);
    expect(SectionRepeat.start(10)).toBe(true);
    expect(SectionRepeat.end(9)).toBe(false);
    expect(SectionRepeat.end(10)).toBe(false);
    expect(SectionRepeat.end(10.2)).toBe(false);
    expect(SectionRepeat.end(121)).toBe(false);
    expect(SectionRepeat.end(Number.POSITIVE_INFINITY)).toBe(false);
    expect(SectionRepeat.section).toEqual({ start: 10, end: null });
    expect(SectionRepeat.end(10.25)).toBe(true);
  });

  it('clears a section that no longer fits a changed duration', () => {
    SectionRepeat.mount();
    SectionRepeat.playTrack();
    SectionRepeat.start(40);
    SectionRepeat.end(80);
    SectionRepeat.pause();
    SectionRepeat.changeDuration(60);
    expect(SectionRepeat.section).toEqual({ start: null, end: null });
    expect(SectionRepeat.audio.paused).toBe(true);
    SectionRepeat.position(55);
    expect(SectionRepeat.audio.currentTime).toBe(55);
  });

  it('accepts an exact minimum section with fractional timestamps', () => {
    SectionRepeat.mount();
    SectionRepeat.playTrack('/short.mp3', 0.35);
    expect(SectionRepeat.start(0.1)).toBe(true);
    expect(SectionRepeat.end(0.35)).toBe(true);
    SectionRepeat.position(0.35);
    expect(SectionRepeat.audio.currentTime).toBe(0.1);
    expect(SectionRepeat.section).toEqual({ start: 0.1, end: 0.35 });
  });
});
