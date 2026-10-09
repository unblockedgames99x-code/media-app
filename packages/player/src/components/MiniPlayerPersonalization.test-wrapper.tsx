import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  defaultPersonalization,
  usePersonalizationStore,
} from '../stores/personalizationStore';
import { useSettingsStore } from '../stores/settingsStore';
import { MiniPlayerPersonalization } from './MiniPlayerPersonalization';

const pluginPanel = (onPlay = () => {}) =>
  render(
    <section id="nuke-mp-panel" aria-label="Mini player">
      <div id="nuke-mp-header">
        <span data-testid="mini-player-identity">nuclear | player</span>
        <div>
          <button onClick={onPlay}>Play or pause</button>
          <button>Full screen</button>
          <button>Queue</button>
          <button>Settings</button>
        </div>
      </div>
      <input aria-label="Seek" type="range" defaultValue="40" />
      <p style={{ fontSize: '24px' }}>Lyrics</p>
    </section>,
  );

export const MiniPlayerPersonalizationWrapper = {
  reset() {
    usePersonalizationStore.setState({
      settings: structuredClone(defaultPersonalization),
    });
    useSettingsStore.setState({ values: {}, definitions: {} });
  },
  mount() {
    return render(<MiniPlayerPersonalization />);
  },
  addPlugin: pluginPanel,
  identity(displayName: string, logoDataUrl = '') {
    act(() =>
      usePersonalizationStore.setState((state) => ({
        settings: { ...state.settings, identity: { displayName, logoDataUrl } },
      })),
    );
  },
  themeSync(enabled: boolean) {
    act(() =>
      useSettingsStore.setState((state) => ({
        values: {
          ...state.values,
          'plugin.nuclear-mini-player.mp_theme_sync': enabled,
        },
      })),
    );
  },
  get panel() {
    return screen.getByRole('region', { name: 'Mini player' });
  },
  get brand() {
    return screen.getByTestId('mini-player-identity');
  },
  get logo() {
    return within(this.brand).getByRole('presentation');
  },
  get lyrics() {
    return screen.getByText('Lyrics');
  },
  get seek() {
    return screen.getByRole('slider', { name: 'Seek' });
  },
  get play() {
    return screen.getByRole('button', { name: 'Play or pause' });
  },
  async clickPlay() {
    await userEvent.click(this.play);
  },
};
