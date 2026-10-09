import { useCallback, useEffect, useRef } from 'react';

import {
  releaseAudioProcessing,
  updateAudioProcessing,
} from '../../../engines/cartertube/src/shared/audioProcessing.mjs';
import { useAudioEvents } from './hooks/useAudioEvents';
import { useAudioLoader } from './hooks/useAudioLoader';
import { useAudioSeek } from './hooks/useAudioSeek';
import { useHlsSource } from './hooks/useHlsSource';
import { useMseSource } from './hooks/useMseSource';
import { usePlaybackStatus } from './hooks/usePlaybackStatus';
import { useStartPosition } from './hooks/useStartPosition';
import { SoundProps } from './types';

export const Sound: React.FC<SoundProps> = ({
  src,
  status,
  seek,
  volume,
  processing,
  preload = 'auto',
  crossOrigin = '',
  onTimeUpdate,
  onEnd,
  onLoadStart,
  onCanPlay,
  onError,
  onSourceInvalid,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const processingRef = useRef(processing);
  processingRef.current = processing;
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    clearTimeout(releaseTimer.current);
    const media = audioRef.current;
    const apply = () => {
      if (media && processingRef.current) {
        updateAudioProcessing(media, processingRef.current);
      }
    };
    media?.addEventListener('loadedmetadata', apply);
    return () => {
      media?.removeEventListener('loadedmetadata', apply);
      releaseTimer.current = setTimeout(() => {
        if (media) {
          releaseAudioProcessing(media);
        }
      }, 0);
    };
  }, []);

  useEffect(() => {
    if (audioRef.current && processing) {
      updateAudioProcessing(audioRef.current, processing);
    }
  }, [processing]);

  useAudioSeek(audioRef, seek);
  useStartPosition(audioRef, src);
  useAudioLoader(audioRef, src);
  useHlsSource(audioRef, src);
  useMseSource(audioRef, src, onError, onSourceInvalid);
  usePlaybackStatus(audioRef, status, src.url, onError);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || volume === undefined) {
      return;
    }

    audio.volume = Math.max(0, Math.min(1, volume / 100));
  }, [volume]);

  const handleCanPlay = useCallback(() => {
    onCanPlay?.();
  }, [onCanPlay]);

  const handleLoadStart = useCallback(() => {
    onLoadStart?.();
  }, [onLoadStart]);

  const { handleTimeUpdate, handleError } = useAudioEvents({
    onTimeUpdate,
    onError,
  });

  return (
    <audio
      ref={audioRef}
      hidden
      preload={preload}
      crossOrigin={crossOrigin}
      onTimeUpdate={handleTimeUpdate}
      onEnded={onEnd}
      onLoadStart={handleLoadStart}
      onCanPlay={handleCanPlay}
      onError={handleError}
    />
  );
};
