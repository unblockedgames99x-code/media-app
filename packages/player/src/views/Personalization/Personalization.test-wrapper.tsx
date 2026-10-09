import { LazyStore } from '@tauri-apps/plugin-store';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';

import { i18n } from '@nuclearplayer/i18n';

import {
  flushPersonalizationPersistence,
  usePersonalizationStore,
} from '../../stores/personalizationStore';
import { Personalization } from './Personalization';

export const PersonalizationWrapper = {
  reset() {
    act(() => {
      usePersonalizationStore.getState().reset();
    });
  },
  mount() {
    return render(
      <I18nextProvider i18n={i18n}>
        <Personalization />
      </I18nextProvider>,
    );
  },
  get heading() {
    return screen.getByRole('heading', { name: 'Make it yours', level: 1 });
  },
  get preview() {
    return screen.getByRole('region', { name: 'Live preview' });
  },
  get settings() {
    return usePersonalizationStore.getState().settings;
  },
  async rapidlyResizeSidebar() {
    await flushPersonalizationPersistence();
    const save = vi.spyOn(LazyStore.prototype, 'save');
    act(() => {
      for (let width = 160; width <= 260; width++) {
        usePersonalizationStore
          .getState()
          .updateSection('layout', { sidebarWidth: width });
      }
    });
    await act(async () => flushPersonalizationPersistence());
    const writeCount = save.mock.calls.length;
    save.mockRestore();
    return writeCount;
  },
  get notice() {
    return screen.getByRole('status');
  },
  get error() {
    return screen.getByRole('alert');
  },
  async tab(name: string) {
    await userEvent.click(screen.getByRole('tab', { name }));
  },
  async text(name: string, value: string) {
    const input = screen.getByRole('textbox', { name });
    await userEvent.clear(input);
    await userEvent.type(input, value);
    await userEvent.tab();
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
  async number(name: string, value: number) {
    const input = screen.getByRole('spinbutton', { name });
    await userEvent.clear(input);
    await userEvent.type(input, String(value));
    await userEvent.tab();
  },
  async click(name: string) {
    await userEvent.click(screen.getByRole('button', { name, exact: true }));
  },
  get profileJson() {
    return (
      screen.getByRole('textbox', {
        name: 'Profile JSON',
      }) as HTMLTextAreaElement
    ).value;
  },
  async setProfileJson(value: string) {
    const input = screen.getByRole('textbox', { name: 'Profile JSON' });
    await userEvent.clear(input);
    await userEvent.paste(value);
  },
  async rehydrate() {
    const diskStore = new LazyStore('personalization.json');
    await flushPersonalizationPersistence();
    const persisted = await diskStore.get('media-personalization');
    act(() => {
      usePersonalizationStore.getState().reset();
    });
    await flushPersonalizationPersistence();
    await diskStore.set('media-personalization', persisted);
    await diskStore.save();
    await act(async () => usePersonalizationStore.persist.rehydrate());
  },
};
