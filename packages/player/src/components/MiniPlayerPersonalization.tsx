import { FC, useEffect, useRef } from 'react';

import { observeMiniPlayerPersonalization } from '../services/miniPlayerPersonalization';
import { usePersonalizationStore } from '../stores/personalizationStore';
import { useSettingsStore } from '../stores/settingsStore';

import './miniPlayerPersonalization.css';

export const MiniPlayerPersonalization: FC = () => {
  const identity = usePersonalizationStore((state) => state.settings.identity);
  const themeSync = useSettingsStore(
    (state) =>
      state.getValue('plugin.nuclear-mini-player.mp_theme_sync') !== false,
  );
  const adapter = useRef<ReturnType<
    typeof observeMiniPlayerPersonalization
  > | null>(null);

  useEffect(() => {
    const controller = observeMiniPlayerPersonalization({
      identity: usePersonalizationStore.getState().settings.identity,
      themeSync:
        useSettingsStore
          .getState()
          .getValue('plugin.nuclear-mini-player.mp_theme_sync') !== false,
    });
    adapter.current = controller;
    return () => {
      adapter.current = null;
      controller.disconnect();
    };
  }, []);

  useEffect(() => {
    adapter.current?.update({ identity, themeSync });
  }, [identity, themeSync]);

  return null;
};
