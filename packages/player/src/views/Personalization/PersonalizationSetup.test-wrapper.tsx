import { LazyStore } from '@tauri-apps/plugin-store';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';

import { i18n } from '@nuclearplayer/i18n';

import {
  flushPersonalizationPersistence,
  usePersonalizationStore,
} from '../../stores/personalizationStore';
import { PersonalizationSetup } from './PersonalizationSetup';

export const SetupWrapper = {
  reset() {
    act(() => {
      usePersonalizationStore.getState().reset();
      usePersonalizationStore.getState().restartSetup();
      usePersonalizationStore.setState({ hydrated: true });
    });
  },
  mount() {
    return render(
      <I18nextProvider i18n={i18n}>
        <PersonalizationSetup />
      </I18nextProvider>,
    );
  },
  get dialog() {
    return screen.getByRole('dialog');
  },
  get heading() {
    return screen.getByRole('heading', { name: 'Your media, your way' });
  },
  get error() {
    return screen.findByRole('alert');
  },
  failSaving() {
    vi.spyOn(LazyStore.prototype, 'save').mockRejectedValue(
      new Error('Storage is full'),
    );
  },
  restoreSaving() {
    vi.mocked(LazyStore.prototype.save).mockRestore();
  },
  async flush() {
    await act(async () => flushPersonalizationPersistence());
  },
  get settings() {
    return usePersonalizationStore.getState().settings;
  },
  get completed() {
    return usePersonalizationStore.getState().setupCompleted;
  },
  async click(name: string) {
    await userEvent.click(screen.getByRole('button', { name, exact: true }));
  },
  async name(value: string) {
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Your app name' }),
      value,
    );
  },
  async select(name: string, value: string) {
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name }),
      value,
    );
  },
  async toggle(name: string) {
    await userEvent.click(screen.getByRole('checkbox', { name }));
  },
  restart() {
    act(() => {
      usePersonalizationStore.getState().restartSetup();
    });
  },
  async rehydrate() {
    await act(async () => usePersonalizationStore.persist.rehydrate());
  },
};
