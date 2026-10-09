import { getCurrentWindow } from '@tauri-apps/api/window';
import { FC } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import { TitleBar } from '@nuclearplayer/ui';

import { useCoreSetting } from '../hooks/useCoreSetting';
import { usePersonalizationStore } from '../stores/personalizationStore';

const appWindow = getCurrentWindow();

export const ConnectedTitleBar: FC = () => {
  const [isEnabled] = useCoreSetting<boolean>('appearance.customTitleBar');
  const { t } = useTranslation('titleBar');
  const displayName = usePersonalizationStore(
    (state) => state.settings.identity.displayName,
  );
  const [titleBarStyle] = useCoreSetting<string>('appearance.titleBarStyle');

  const styleOverride =
    titleBarStyle === 'auto' || !titleBarStyle
      ? undefined
      : (titleBarStyle as 'macos' | 'windows');

  return (
    isEnabled && (
      <TitleBar
        title={displayName}
        styleOverride={styleOverride}
        onMinimize={() => appWindow.minimize()}
        onMaximize={() => appWindow.toggleMaximize()}
        onClose={() => appWindow.close()}
        onStartDrag={() => appWindow.startDragging()}
        labels={{
          minimize: t('minimize'),
          maximize: t('maximize'),
          close: t('close'),
        }}
      />
    )
  );
};
