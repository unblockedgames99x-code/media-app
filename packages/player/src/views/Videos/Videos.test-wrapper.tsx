import { invoke } from '@tauri-apps/api/core';
import { EventCallback, listen } from '@tauri-apps/api/event';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';

import { i18n } from '@nuclearplayer/i18n';
import { Popover } from '@nuclearplayer/ui';

import { usePersonalizationStore } from '../../stores/personalizationStore';
import { useSettingsModalStore } from '../../stores/settingsModalStore';
import { useSoundStore } from '../../stores/soundStore';
import { useVideoLinkStore } from '../../stores/videoLinkStore';
import { Videos } from './Videos';

vi.mock('@tauri-apps/api/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tauri-apps/api/core')>()),
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

const user = userEvent.setup();
const nativeInvoke = vi.mocked(invoke);
let bounds = { x: 200, y: 80, width: 800, height: 600 };
let attachResult = () => Promise.resolve({ ready: true, pid: 42 });

export const VideosWrapper = {
  reset() {
    usePersonalizationStore.setState({ setupCompleted: true, hydrated: true });
    bounds = { x: 200, y: 80, width: 800, height: 600 };
    attachResult = () => Promise.resolve({ ready: true, pid: 42 });
    useSoundStore.setState({ status: 'playing', seek: 27 });
    useSettingsModalStore.setState({ isOpen: false });
    useVideoLinkStore.setState({ pending: null, sequence: 0 });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () => DOMRect.fromRect(bounds),
    );
    nativeInvoke.mockReset();
    vi.mocked(listen).mockClear();
    nativeInvoke.mockImplementation((command) => {
      if (command === 'video_engine_attach') {
        return attachResult() as ReturnType<typeof invoke>;
      }
      return Promise.resolve(undefined) as ReturnType<typeof invoke>;
    });
  },

  startSetup() {
    act(() => {
      usePersonalizationStore.setState({ setupCompleted: false });
    });
  },

  finishSetup() {
    act(() => {
      usePersonalizationStore.setState({ setupCompleted: true });
    });
  },

  get attachCount() {
    return nativeInvoke.mock.calls.filter(
      ([command]) => command === 'video_engine_attach',
    ).length;
  },

  deferStartup() {
    let resolve!: (value: { ready: boolean; pid: number }) => void;
    attachResult = () =>
      new Promise((resolvePromise) => {
        resolve = resolvePromise;
      });
    return () => act(async () => resolve({ ready: true, pid: 42 }));
  },

  failStartup() {
    attachResult = () =>
      Promise.reject(new Error('Video engine could not start'));
  },

  restoreStartup() {
    attachResult = () => Promise.resolve({ ready: true, pid: 42 });
  },

  openVideoLink(path: string) {
    act(() => useVideoLinkStore.getState().request(path));
  },

  async videoLinkOpened(path: string) {
    await waitFor(() =>
      expect(nativeInvoke).toHaveBeenCalledWith('video_engine_navigate', {
        path,
      }),
    );
    await waitFor(() =>
      expect(useVideoLinkStore.getState().pending).toBeNull(),
    );
  },

  get navigationCount() {
    return nativeInvoke.mock.calls.filter(
      ([command]) => command === 'video_engine_navigate',
    ).length;
  },

  async crashEngine() {
    const subscription = vi
      .mocked(listen)
      .mock.calls.find(([event]) => event === 'video-engine-unavailable')!;
    const callback = subscription[1] as EventCallback<string>;
    act(() =>
      callback({
        event: 'video-engine-unavailable',
        id: 1,
        payload: 'Videos stopped unexpectedly',
      }),
    );
    await waitFor(() =>
      expect(this.error).toHaveTextContent('Videos could not open'),
    );
  },

  mount() {
    return render(
      <I18nextProvider i18n={i18n}>
        <Videos />
        <Popover trigger="Remote control" anchor="bottom">
          <p>Remote control code</p>
        </Popover>
      </I18nextProvider>,
    );
  },

  async openRemoteControl() {
    nativeInvoke.mockClear();
    await user.click(screen.getByText('Remote control'));
    expect(screen.getByText('Remote control code')).toBeVisible();
    await this.hidden();
  },

  async closeRemoteControl() {
    nativeInvoke.mockClear();
    await user.click(screen.getByText('Remote control'));
    await this.attached();
  },

  get workspace() {
    return screen.getByRole('region', { name: 'Videos' });
  },

  get status() {
    return screen.getByRole('status');
  },

  get error() {
    return screen.getByRole('alert');
  },

  get musicStatus() {
    return useSoundStore.getState().status;
  },

  get musicPosition() {
    return useSoundStore.getState().seek;
  },

  startMusicAfterOpeningVideos() {
    act(() => useSoundStore.getState().play());
  },

  retry: {
    get element() {
      return screen.getByRole('button', { name: 'Try again' });
    },
    async click() {
      await user.click(this.element);
    },
  },

  async ready() {
    await waitFor(() => expect(this.status).toHaveTextContent('Videos ready'));
  },

  async attached() {
    await waitFor(() =>
      expect(nativeInvoke).toHaveBeenCalledWith('video_engine_attach', {
        bounds,
        visible: true,
      }),
    );
  },

  async hidden() {
    await waitFor(() =>
      expect(nativeInvoke).toHaveBeenCalledWith('video_engine_hide'),
    );
  },

  async resize() {
    bounds = { x: 240, y: 80, width: 960, height: 720 };
    act(() => window.dispatchEvent(new Event('resize')));
    await this.attached();
  },

  async openSettings() {
    nativeInvoke.mockClear();
    act(() => useSettingsModalStore.getState().open());
    await this.hidden();
  },

  closeSettings() {
    act(() => useSettingsModalStore.getState().close());
  },
};
