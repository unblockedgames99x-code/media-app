import { RefObject, useCallback, useEffect, useRef } from 'react';

import { SectionRepeatRange, SoundProps } from '../types';

type SectionRepeatOptions = Pick<
  SoundProps,
  'status' | 'sectionRepeat' | 'onTimeUpdate' | 'onEnd' | 'onError'
> & { sourceUrl: string };

const validRange = (
  audio: HTMLAudioElement,
  range: SectionRepeatRange | undefined,
): range is SectionRepeatRange =>
  range !== undefined &&
  Number.isFinite(audio.duration) &&
  Number.isFinite(range.start) &&
  Number.isFinite(range.end) &&
  range.start >= 0 &&
  range.end > range.start &&
  range.end <= audio.duration;

export const useSectionRepeat = (
  audioRef: RefObject<HTMLAudioElement | null>,
  options: SectionRepeatOptions,
) => {
  const { status, sectionRepeat, sourceUrl } = options;
  const start = sectionRepeat?.start;
  const end = sectionRepeat?.end;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const audio = audioRef.current;
    if (
      !audio ||
      start === undefined ||
      end === undefined ||
      status === 'stopped'
    ) {
      return;
    }

    const range = { start, end };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clearTimer = () => clearTimeout(timer);
    const checkBoundary = () => {
      clearTimer();
      if (!validRange(audio, range)) {
        return;
      }
      if (audio.currentTime < start || audio.currentTime >= end) {
        audio.currentTime = start;
        optionsRef.current.onTimeUpdate?.({
          position: start,
          duration: audio.duration,
        });
      }
      if (status !== 'playing' || audio.paused || audio.seeking) {
        return;
      }
      const rate = audio.playbackRate > 0 ? audio.playbackRate : 1;
      const delay = Math.max(
        16,
        Math.min(1000, ((end - audio.currentTime) / rate) * 1000),
      );
      timer = setTimeout(checkBoundary, delay);
    };

    const events = [
      'timeupdate',
      'seeked',
      'playing',
      'canplay',
      'ratechange',
      'durationchange',
    ];
    events.forEach((event) => audio.addEventListener(event, checkBoundary));
    audio.addEventListener('pause', clearTimer);
    checkBoundary();
    return () => {
      clearTimer();
      events.forEach((event) =>
        audio.removeEventListener(event, checkBoundary),
      );
      audio.removeEventListener('pause', clearTimer);
    };
  }, [audioRef, start, end, status, sourceUrl]);

  return useCallback(() => {
    const audio = audioRef.current;
    const {
      sectionRepeat: range,
      status: currentStatus,
      onTimeUpdate,
      onEnd,
      onError,
    } = optionsRef.current;
    if (audio && currentStatus !== 'stopped' && validRange(audio, range)) {
      audio.currentTime = range.start;
      onTimeUpdate?.({ position: range.start, duration: audio.duration });
      if (currentStatus === 'playing') {
        void audio.play().catch((error: DOMException) => {
          if (error.name !== 'AbortError') {
            onError?.(error);
          }
        });
      }
      return;
    }
    onEnd?.();
  }, [audioRef]);
};
