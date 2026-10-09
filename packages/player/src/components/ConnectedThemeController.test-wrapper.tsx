import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { registerBuiltInCoreSettings } from '../services/coreSettings';
import { usePersonalizationStore } from '../stores/personalizationStore';
import {
  getSetting,
  initializeSettingsStore,
  setSetting,
} from '../stores/settingsStore';
import { ConnectedThemeController } from './ConnectedThemeController';

export const ThemeControllerWrapper = {
  async mount() {
    await initializeSettingsStore();
    registerBuiltInCoreSettings();
    await setSetting('core.theme.dark', false);
    usePersonalizationStore.getState().reset();
    return render(<ConnectedThemeController />);
  },
  get customPalette() {
    return usePersonalizationStore.getState().settings.palette;
  },
  get isDark() {
    return getSetting('core.theme.dark');
  },
  async toggle() {
    await userEvent.click(screen.getByRole('switch', { name: 'Toggle theme' }));
  },
};
