import { FC } from 'react';

import { SettingsPanel } from '@nuclearplayer/ui';

import { useSettingsModalStore } from '../stores/settingsModalStore';
import { useSettingsNavigation } from './useSettingsNavigation';

export const ConnectedSettingsModal: FC = () => {
  const { isOpen, close } = useSettingsModalStore();
  const { sections, content } = useSettingsNavigation();

  return (
    <SettingsPanel isOpen={isOpen} onClose={close} sections={sections}>
      {content}
    </SettingsPanel>
  );
};
