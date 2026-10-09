import { FC } from 'react';

import { ThemeController } from '@nuclearplayer/ui';

import { useCoreSetting } from '../hooks/useCoreSetting';
import { usePersonalizationStore } from '../stores/personalizationStore';

export const ConnectedThemeController: FC = () => {
  const [isDark, setIsDark] = useCoreSetting<boolean>('theme.dark');

  return (
    <ThemeController
      isDark={isDark ?? false}
      onThemeChange={(isDark) => {
        usePersonalizationStore
          .getState()
          .updateSection('palette', { enabled: false });
        setIsDark(isDark);
      }}
      className="justify-self-end"
    />
  );
};
