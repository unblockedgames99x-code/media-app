import { beforeEach, describe, expect, it } from 'vitest';

import { providersHost } from '../../services/providersHost';
import { useQueueStore } from '../../stores/queueStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useSoundStore } from '../../stores/soundStore';
import { ConnectedPlayerBarWrapper as Wrapper } from './ConnectedPlayerBar.test-wrapper';

beforeEach(() => {
  providersHost.clear();
  useQueueStore.setState({ items: [], currentIndex: 0 });
  useSettingsStore.setState({ definitions: {}, values: {}, loaded: true });
  useSoundStore.setState({
    src: null,
    status: 'stopped',
    seek: 0,
    duration: 0,
    sectionRepeat: { start: null, end: null },
  });
});

const mountSong = async (position = 12.5, duration = 180) => {
  Wrapper.seedQueueItem(new Wrapper.QueueItemBuilder().build());
  await Wrapper.mount();
  Wrapper.seedSectionPlayback(position, duration);
};

describe('Music section repeat', () => {
  it('disables section repeat until a song with a known duration is loaded', async () => {
    await Wrapper.mount();

    expect(Wrapper.sectionRepeat.button).toBeDisabled();
  });

  it('marks start and end from playback, keeps the song paused, and clears the loop', async () => {
    await mountSong();
    await Wrapper.sectionRepeat.open();
    await Wrapper.sectionRepeat.markStart();

    expect(Wrapper.sectionRepeat.startInput).toHaveValue('0:12.5');
    expect(Wrapper.sectionRepeat.button).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await Wrapper.sectionRepeat.close();

    Wrapper.seedSectionPlayback(23);
    await Wrapper.sectionRepeat.open();
    await Wrapper.sectionRepeat.markEnd();

    expect(Wrapper.sectionRepeat.startInput).toHaveValue('0:12.5');
    expect(Wrapper.sectionRepeat.endInput).toHaveValue('0:23');
    expect(Wrapper.sectionRepeat.button).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(Wrapper.sectionRepeat.status).toHaveTextContent(
      'Looping 0:12.5 – 0:23',
    );
    expect(Wrapper.controls.playButton.element).toBeInTheDocument();

    await Wrapper.sectionRepeat.clear();

    expect(Wrapper.sectionRepeat.button).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(Wrapper.sectionRepeat.status).toHaveTextContent(
      'Choose a start and end',
    );
  });

  it('loops an exact section entered as timestamps without changing song repeat', async () => {
    await mountSong();
    Wrapper.seedRepeatMode('one');
    await Wrapper.sectionRepeat.open();
    await Wrapper.sectionRepeat.enterRange('1:10.5', '1:16.75');
    await Wrapper.sectionRepeat.loop();

    expect(Wrapper.sectionRepeat.status).toHaveTextContent(
      'Looping 1:10.5 – 1:16.75',
    );
    expect(Wrapper.sectionRepeat.button).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(useSettingsStore.getState().values['core.playback.repeat']).toBe(
      'one',
    );
  });

  it('rejects an end before the start and preserves the existing loop', async () => {
    await mountSong();
    await Wrapper.sectionRepeat.open();
    await Wrapper.sectionRepeat.enterRange('0:10', '0:20');
    await Wrapper.sectionRepeat.loop();
    await Wrapper.sectionRepeat.enterRange('0:30', '0:15');
    await Wrapper.sectionRepeat.loop();

    expect(Wrapper.sectionRepeat.error).toHaveTextContent(
      'The end must be at least 0.25 seconds after the start',
    );
    expect(Wrapper.sectionRepeat.status).toHaveTextContent(
      'Looping 0:10 – 0:20',
    );
  });

  it.each([
    ['0.1', '0.35', 180, 'Looping 0:00.1 – 0:00.35'],
    ['1:00:02.125', '1:00:03.5', 4000, 'Looping 60:02.125 – 60:03.5'],
  ])(
    'accepts precise timestamps %s to %s',
    async (start, end, duration, expected) => {
      await mountSong(0, duration);
      await Wrapper.sectionRepeat.open();
      await Wrapper.sectionRepeat.enterRange(start, end);
      await Wrapper.sectionRepeat.loop();

      expect(Wrapper.sectionRepeat.status).toHaveTextContent(expected);
      expect(Wrapper.sectionRepeat.button).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    },
  );

  it('rejects invalid timestamps and sections beyond the song duration', async () => {
    await mountSong();
    await Wrapper.sectionRepeat.open();
    await Wrapper.sectionRepeat.enterRange('0:70', '1:20');
    await Wrapper.sectionRepeat.loop();

    expect(Wrapper.sectionRepeat.error).toHaveTextContent(
      'Enter a time as seconds, m:ss, or h:mm:ss',
    );
    expect(Wrapper.sectionRepeat.button).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await Wrapper.sectionRepeat.enterRange('2:50', '3:10');
    await Wrapper.sectionRepeat.loop();

    expect(Wrapper.sectionRepeat.error).toHaveTextContent('within the song');
    expect(Wrapper.sectionRepeat.button).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
