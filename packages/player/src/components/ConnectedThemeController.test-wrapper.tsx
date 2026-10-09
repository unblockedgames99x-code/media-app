import { LazyStore } from '@tauri-apps/plugin-store';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';

import { i18n } from '@nuclearplayer/i18n';

import { registerBuiltInCoreSettings } from '../services/coreSettings';
import {
  flushPersonalizationPersistence,
  usePersonalizationStore,
} from '../stores/personalizationStore';
import {
  getSetting,
  initializeSettingsStore,
  setSetting,
} from '../stores/settingsStore';
import { Personalization } from '../views/Personalization/Personalization';
import { ConnectedThemeController } from './ConnectedThemeController';
import { PersonalizationController } from './PersonalizationController';

export const ThemeControllerWrapper = {
  async mount() {
    await initializeSettingsStore();
    registerBuiltInCoreSettings();
    await setSetting('core.theme.dark', false);
    usePersonalizationStore.getState().reset();
    return render(
      <I18nextProvider i18n={i18n}>
        <PersonalizationController />
        <ConnectedThemeController />
        <Personalization />
      </I18nextProvider>,
    );
  },
  get element() {
    return screen.getByRole('switch', { name: 'Toggle theme' });
  },
  get preview() {
    return screen.getByRole('region', { name: 'Live preview' });
  },
  get variables() {
    return getComputedStyle(document.documentElement);
  },
  get settings() {
    return usePersonalizationStore.getState().settings;
  },
  get customPalette() {
    return usePersonalizationStore.getState().settings.palette;
  },
  get isDark() {
    return getSetting('core.theme.dark');
  },
  async toggle() {
    await userEvent.click(this.element);
  },
  async preset(name: string) {
    await userEvent.click(screen.getByRole('button', { name, exact: true }));
  },
  async editAccent(value: string) {
    const input = screen.getByRole('textbox', { name: 'Accent hex' });
    await userEvent.clear(input);
    await userEvent.type(input, value);
    await userEvent.tab();
  },
  async useOriginalTheme() {
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Use my colors' }),
    );
  },
  async rehydrate() {
    const diskStore = new LazyStore('personalization.json');
    await flushPersonalizationPersistence();
    const persisted = await diskStore.get('media-personalization');
    act(() => usePersonalizationStore.getState().reset());
    await flushPersonalizationPersistence();
    await diskStore.set('media-personalization', persisted);
    await act(async () => usePersonalizationStore.persist.rehydrate());
  },
  importLegacyProfile() {
    const profile = JSON.parse(
      usePersonalizationStore.getState().exportProfile(),
    );
    delete profile.settings.palette.mode;
    act(() =>
      usePersonalizationStore.getState().importProfile(JSON.stringify(profile)),
    );
  },
  async customize() {
    await userEvent.click(screen.getByRole('tab', { name: 'Typography' }));
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Body font' }),
      'mono',
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Layout' }));
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Density' }),
      'compact',
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Sound' }));
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Interface sounds' }),
    );
  },
};
