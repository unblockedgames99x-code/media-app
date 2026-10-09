import { waitFor } from '@testing-library/react';

import { playbackManager } from '../services/playback';
import { providersHost } from '../services/providersHost';
import { useFavoritesStore } from '../stores/favoritesStore';
import { useQueueStore } from '../stores/queueStore';
import { useSoundStore } from '../stores/soundStore';
import {
  createMockCandidate,
  createMockStream,
  StreamingProviderBuilder,
} from '../test/builders/StreamingProviderBuilder';
import { resetInMemoryTauriStore } from '../test/utils/inMemoryTauriStore';
import {
  TrackRowRegion,
  ConnectedTrackTableWrapper as Wrapper,
} from './ConnectedTrackTable.test-wrapper';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(9100),
}));

describe('Connected track row playback', () => {
  beforeEach(() => {
    resetInMemoryTauriStore();
    providersHost.clear();
    playbackManager.pause();
    useQueueStore.setState({
      items: [],
      currentIndex: 0,
      isReady: true,
      isLoading: false,
    });
    useSoundStore.setState({ src: null, status: 'stopped' });
    useFavoritesStore.setState({
      tracks: [],
      albums: [],
      artists: [],
      loaded: true,
    });
    providersHost.register(
      new StreamingProviderBuilder()
        .withSearchForTrack(async (_artist, title) => [
          createMockCandidate(title, title),
        ])
        .withGetStreamUrl(async (candidateId) => createMockStream(candidateId))
        .build(),
    );
  });

  describe.each([false, true])('with reorderable=%s', (reorderable) => {
    it.each<TrackRowRegion>([
      'row',
      'artwork',
      'artist',
      'title',
      'album',
      'duration',
    ])('plays the clicked song from its %s', async (region) => {
      const first = Wrapper.fixtures.track('First');
      const selected = Wrapper.fixtures.track('Selected');
      const component = await Wrapper.mount([first, selected], reorderable);

      await Wrapper.clickRegion(selected.title, region);

      await waitFor(() => {
        expect(useQueueStore.getState().getCurrentItem()?.track.source).toEqual(
          selected.source,
        );
        expect(useSoundStore.getState().status).toBe('playing');
      });
      expect(useQueueStore.getState().items).toHaveLength(1);
      expect(useQueueStore.getState().getCurrentItem()?.status).toBe('success');
      expect(useSoundStore.getState().src?.url).toContain(
        btoa('https://example.com/Selected.mp3').replace(/=+$/, ''),
      );
      expect(component.onReorder).not.toHaveBeenCalled();
    });

    it.each(['Enter', 'Space'] as const)(
      'plays the focused row with %s',
      async (key) => {
        const selected = Wrapper.fixtures.track('Selected');
        await Wrapper.mount([selected], reorderable);

        await Wrapper.playWithKeyboard(selected.title, key);

        await waitFor(() => {
          expect(
            useQueueStore.getState().getCurrentItem()?.track.source,
          ).toEqual(selected.source);
          expect(useSoundStore.getState().status).toBe('playing');
        });
        expect(useQueueStore.getState().items).toHaveLength(1);
      },
    );
  });

  it('switches to the clicked song while another song is playing', async () => {
    const first = Wrapper.fixtures.track('First');
    const selected = Wrapper.fixtures.track('Selected');
    await Wrapper.mount([first, selected]);
    await Wrapper.clickRegion(first.title, 'artist');
    await waitFor(() =>
      expect(useSoundStore.getState().status).toBe('playing'),
    );
    const previousItemId = useQueueStore.getState().getCurrentItem()?.id;

    await Wrapper.clickRegion(selected.title, 'artwork');

    await waitFor(() => {
      expect(useQueueStore.getState().getCurrentItem()?.track.source).toEqual(
        selected.source,
      );
      expect(useSoundStore.getState().status).toBe('playing');
    });
    expect(useQueueStore.getState().getCurrentItem()?.id).not.toBe(
      previousItemId,
    );
    expect(useQueueStore.getState().items).toHaveLength(1);
  });

  it('favorites, removes and opens options without replacing playback', async () => {
    const first = Wrapper.fixtures.track('First');
    const selected = Wrapper.fixtures.track('Selected');
    const component = await Wrapper.mount([first, selected], true);
    await Wrapper.clickRegion(first.title, 'title');
    await waitFor(() =>
      expect(useSoundStore.getState().status).toBe('playing'),
    );
    const playingItem = useQueueStore.getState().getCurrentItem();
    const playingSource = useSoundStore.getState().src;

    await Wrapper.clickAction(selected.title, 'Add to favorites');
    expect(useFavoritesStore.getState().isTrackFavorite(selected.source)).toBe(
      true,
    );
    await Wrapper.useActionWithKeyboard(
      selected.title,
      'Remove from favorites',
    );
    expect(useFavoritesStore.getState().isTrackFavorite(selected.source)).toBe(
      false,
    );
    await Wrapper.clickAction(selected.title, 'Remove from list');
    expect(component.onRemove).toHaveBeenCalledWith(selected, 1);
    await Wrapper.openContextMenu(selected.title);
    await Wrapper.selectContextAction('Add to favorites');
    expect(useFavoritesStore.getState().isTrackFavorite(selected.source)).toBe(
      true,
    );

    expect(useQueueStore.getState().getCurrentItem()).toBe(playingItem);
    expect(useQueueStore.getState().items).toHaveLength(1);
    expect(useSoundStore.getState().src).toBe(playingSource);
    expect(useSoundStore.getState().status).toBe('playing');
  });

  it('queues a song using its plus button without interrupting the current song', async () => {
    const first = Wrapper.fixtures.track('First');
    const selected = Wrapper.fixtures.track('Selected');
    await Wrapper.mount([first, selected], true);
    await Wrapper.clickRegion(first.title, 'title');
    await waitFor(() =>
      expect(useSoundStore.getState().status).toBe('playing'),
    );
    const playingItem = useQueueStore.getState().getCurrentItem();

    await Wrapper.clickAction(selected.title, 'Add to queue');

    expect(useQueueStore.getState().getCurrentItem()).toBe(playingItem);
    expect(
      useQueueStore.getState().items.map((item) => item.track.source),
    ).toEqual([first.source, selected.source]);
    expect(useSoundStore.getState().status).toBe('playing');
  });

  it('reorders a dragged row without starting playback', async () => {
    const first = Wrapper.fixtures.track('First');
    const selected = Wrapper.fixtures.track('Selected');
    const component = await Wrapper.mount([first, selected], true);

    await Wrapper.dragFirstRowAfterSecond();

    expect(component.onReorder).toHaveBeenCalledWith(0, 1);
    expect(useQueueStore.getState().items).toHaveLength(0);
    expect(useSoundStore.getState().status).toBe('stopped');
  });
});
