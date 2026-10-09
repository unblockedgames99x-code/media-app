import { invoke } from '@tauri-apps/api/core';
import { EventCallback, listen } from '@tauri-apps/api/event';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';

import { i18n } from '@nuclearplayer/i18n';

import { ConnectedVideoNavigation } from './ConnectedVideoNavigation';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

type VideoNavigationStatus = {
  path: string;
  hiddenNavigation: { trending: boolean; popular: boolean; playlists: boolean };
};

const navigation = {
  mount() {
    return render(
      <I18nextProvider i18n={i18n}>
        <ConnectedVideoNavigation />
      </I18nextProvider>,
    );
  },
  updateFromEngine(payload: VideoNavigationStatus) {
    const callback = vi
      .mocked(listen)
      .mock.calls.find(
        ([event]) => event === 'video-engine-navigation',
      )![1] as EventCallback<VideoNavigationStatus>;
    act(() => callback({ event: 'video-engine-navigation', id: 1, payload }));
  },
  get visibleLabels() {
    return screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'));
  },
  section(name: string) {
    return {
      get element() {
        return screen.getByRole('button', { name });
      },
      async click() {
        await userEvent.setup().click(this.element);
      },
    };
  },
};

describe('Video navigation', () => {
  beforeEach(() => vi.mocked(listen).mockClear());
  afterEach(cleanup);

  it('keeps every video section accessible in the unified sidebar', () => {
    navigation.mount();
    for (const name of [
      'For you',
      'Subscriptions',
      'Channels',
      'Trending',
      'Most popular',
      'Playlists',
      'History',
      'Video settings',
      'Profiles',
      'About',
    ]) {
      expect(navigation.section(name).element).toBeInTheDocument();
    }
  });

  it('opens the selected section in the embedded video engine', async () => {
    navigation.mount();
    await navigation.section('Subscriptions').click();
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('video_engine_navigate', {
        path: '/subscriptions',
      }),
    );
    expect(navigation.section('Subscriptions').element).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('tracks video navigation from the engine and clears selection on video pages', () => {
    navigation.mount();
    const hiddenNavigation = {
      trending: false,
      popular: false,
      playlists: false,
    };
    navigation.updateFromEngine({
      path: '/settings/profile/',
      hiddenNavigation,
    });
    expect(navigation.section('Profiles').element).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(navigation.section('Video settings').element).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    navigation.updateFromEngine({ path: '/watch/example', hiddenNavigation });
    expect(navigation.section('Profiles').element).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(navigation.section('For you').element).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('honors hidden navigation preferences and restores the sections when enabled again', () => {
    navigation.mount();
    navigation.updateFromEngine({
      path: '/home',
      hiddenNavigation: { trending: true, popular: true, playlists: true },
    });
    expect(navigation.visibleLabels).not.toContain('Trending');
    expect(navigation.visibleLabels).not.toContain('Most popular');
    expect(navigation.visibleLabels).not.toContain('Playlists');
    for (const name of [
      'For you',
      'Subscriptions',
      'Channels',
      'History',
      'Video settings',
      'Profiles',
      'About',
    ]) {
      expect(navigation.section(name).element).toBeInTheDocument();
    }
    navigation.updateFromEngine({
      path: '/subscriptions',
      hiddenNavigation: { trending: false, popular: false, playlists: false },
    });
    expect(navigation.visibleLabels).toContain('Trending');
    expect(navigation.visibleLabels).toContain('Most popular');
    expect(navigation.visibleLabels).toContain('Playlists');
    expect(navigation.section('Subscriptions').element).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
