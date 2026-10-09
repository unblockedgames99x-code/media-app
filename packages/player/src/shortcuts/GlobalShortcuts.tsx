import { FC } from 'react';

import { playbackManager } from '../services/playback';
import { useQueueStore } from '../stores/queueStore';
import { useSettingsModalStore } from '../stores/settingsModalStore';
import { getSetting, setSetting } from '../stores/settingsStore';
import { useSoundStore } from '../stores/soundStore';
import { useShortcut } from './useShortcut';

type GlobalShortcutsProps = { playbackEnabled?: boolean };

export const GlobalShortcuts: FC<GlobalShortcutsProps> = ({
  playbackEnabled = true,
}) => {
  useShortcut(
    'playback.toggle',
    () => {
      playbackManager.toggle();
    },
    playbackEnabled,
  );

  useShortcut(
    'playback.next',
    () => {
      useQueueStore.getState().goToNext();
    },
    playbackEnabled,
  );

  useShortcut(
    'playback.previous',
    () => {
      useQueueStore.getState().goToPrevious();
    },
    playbackEnabled,
  );

  useShortcut(
    'playback.seekForward',
    () => {
      const { seek, duration } = useSoundStore.getState();
      const skipSeconds =
        (getSetting('core.playback.skipSeconds') as number) ?? 5;
      useSoundStore.getState().seekTo(Math.min(seek + skipSeconds, duration));
    },
    playbackEnabled,
  );

  useShortcut(
    'playback.seekBackward',
    () => {
      const { seek } = useSoundStore.getState();
      const skipSeconds =
        (getSetting('core.playback.skipSeconds') as number) ?? 5;
      useSoundStore.getState().seekTo(Math.max(0, seek - skipSeconds));
    },
    playbackEnabled,
  );

  useShortcut(
    'playback.volumeUp',
    () => {
      const volume = getSetting('core.playback.volume') as number;
      void setSetting('core.playback.volume', Math.min(1, volume + 0.05));
    },
    playbackEnabled,
  );

  useShortcut(
    'playback.volumeDown',
    () => {
      const volume = getSetting('core.playback.volume') as number;
      void setSetting('core.playback.volume', Math.max(0, volume - 0.05));
    },
    playbackEnabled,
  );

  useShortcut(
    'playback.mute',
    () => {
      const muted = getSetting('core.playback.muted') as boolean;
      void setSetting('core.playback.muted', !muted);
    },
    playbackEnabled,
  );

  useShortcut('general.toggleSettings', () => {
    const { isOpen, open, close } = useSettingsModalStore.getState();
    if (isOpen) {
      close();
    } else {
      open();
    }
  });

  return null;
};
