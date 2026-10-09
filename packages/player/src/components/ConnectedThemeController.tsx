import { FC, useEffect } from 'react';

import { ThemeController } from '@nuclearplayer/ui';

import { useCoreSetting } from '../hooks/useCoreSetting';
import { isPersonalizationDark } from '../services/personalizationPalette';
import { usePersonalizationStore } from '../stores/personalizationStore';

export const ConnectedThemeController: FC = () => {
  const [isDark, setIsDark] = useCoreSetting<boolean>('theme.dark');
  const palette = usePersonalizationStore((state) => state.settings.palette);
  const activeIsDark = palette.enabled
    ? isPersonalizationDark(palette)
    : (isDark ?? false);

  useEffect(() => {
    if (palette.enabled && isDark !== activeIsDark) {
      setIsDark(activeIsDark);
    }
  }, [palette.enabled, isDark, activeIsDark, setIsDark]);

  return (
    <ThemeController
      isDark={activeIsDark}
      onThemeChange={(isDark) => {
        if (palette.enabled) {
          usePersonalizationStore
            .getState()
            .updateSection('palette', { mode: isDark ? 'dark' : 'light' });
        }
        setIsDark(isDark);
      }}
      className="justify-self-end"
    />
  );
};
