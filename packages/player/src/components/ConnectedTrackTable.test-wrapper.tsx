import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { Track } from '@nuclearplayer/model';

import { GlobalShortcuts } from '../shortcuts/GlobalShortcuts';
import { createMockTrack } from '../test/utils/mockTrack';
import { ConnectedTrackTable } from './ConnectedTrackTable';
import { StreamResolver } from './StreamResolver';

const user = userEvent.setup();

export type TrackRowRegion =
  'row' | 'artwork' | 'artist' | 'title' | 'album' | 'duration';

export const ConnectedTrackTableWrapper = {
  fixtures: {
    track(title: string): Track {
      return {
        ...createMockTrack(title),
        artwork: { items: [{ url: `https://example.com/${title}.jpg` }] },
        album: {
          title: `${title} album`,
          source: { provider: 'test', id: `${title}-album` },
        },
        durationMs: 180000,
      };
    },
  },

  async mount(tracks: Track[], reorderable = false) {
    const onRemove = vi.fn();
    const onReorder = vi.fn();
    const component = render(
      <>
        <GlobalShortcuts />
        <StreamResolver />
        <ConnectedTrackTable
          tracks={tracks}
          features={{ filterable: false, reorderable }}
          display={{ displayAlbum: true, displayDeleteButton: true }}
          actions={{ onRemove, onReorder }}
        />
      </>,
    );
    await screen.findByRole('button', { name: tracks[0].title });
    return { ...component, onRemove, onReorder };
  },

  row(title: string) {
    return screen
      .getByRole('button', { name: title, exact: true })
      .closest('tr')!;
  },

  async clickRegion(title: string, region: TrackRowRegion) {
    const row = this.row(title);
    const elements = within(row);
    const target = {
      row: () => row,
      artwork: () => elements.getByRole('img'),
      artist: () => elements.getByText('Test Artist'),
      title: () => elements.getByRole('button', { name: title, exact: true }),
      album: () => elements.getByText(`${title} album`),
      duration: () => elements.getByText('3:00'),
    }[region]();
    await user.click(target);
  },

  async playWithKeyboard(title: string, key: 'Enter' | 'Space') {
    const row = this.row(title);
    row.focus();
    expect(row).toHaveFocus();
    await user.keyboard(key === 'Enter' ? '{Enter}' : ' ');
  },

  async clickAction(title: string, label: string) {
    await user.click(
      within(this.row(title)).getByRole('button', { name: label }),
    );
  },

  async useActionWithKeyboard(title: string, label: string) {
    const action = within(this.row(title)).getByRole('button', { name: label });
    action.focus();
    await user.keyboard('{Enter}');
  },

  async openContextMenu(title: string) {
    await this.clickAction(title, 'Track options');
    await screen.findByRole('menuitem', { name: 'Play now' });
  },

  async selectContextAction(label: string) {
    await user.click(screen.getByRole('menuitem', { name: label }));
  },

  async dragFirstRowAfterSecond() {
    const rows = screen.getAllByTestId('track-row');
    rows.forEach((row, index) => {
      vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(
        new DOMRect(0, index * 42, 600, 42),
      );
    });
    await user.pointer([
      { target: rows[0], keys: '[MouseLeft>]', coords: { x: 20, y: 20 } },
      { target: rows[0], coords: { x: 20, y: 30 } },
      { target: rows[1], coords: { x: 20, y: 65 } },
      { keys: '[/MouseLeft]' },
    ]);
  },
};
