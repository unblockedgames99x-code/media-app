import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import { LocateFixed } from 'lucide-react';
import { FC, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useTranslation } from '@nuclearplayer/i18n';
import { Button, Input, Tooltip } from '@nuclearplayer/ui';

import { useQueueStore } from '../../stores/queueStore';
import {
  isValidSectionRepeatRange,
  SECTION_REPEAT_MIN_SECONDS,
  useSoundStore,
} from '../../stores/soundStore';

const formatPosition = (seconds: number): string => {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const minutes = Math.floor(milliseconds / 60000);
  const wholeSeconds = Math.floor(milliseconds / 1000) % 60;
  const fraction = String(milliseconds % 1000)
    .padStart(3, '0')
    .replace(/0+$/, '');
  return `${minutes}:${String(wholeSeconds).padStart(2, '0')}${fraction ? `.${fraction}` : ''}`;
};

const parsePosition = (value: string): number | null => {
  const timestamp = value.trim();
  if (!/^\d+(?::[0-5]?\d){0,2}(?:\.\d{1,3})?$/.test(timestamp)) {
    return null;
  }
  const seconds = timestamp
    .split(':')
    .reduce((total, part) => total * 60 + Number(part), 0);
  return Number.isFinite(seconds) ? seconds : null;
};

const SectionRepeatPanel: FC = () => {
  const { t } = useTranslation('playerBar');
  const sectionRepeat = useSoundStore((state) => state.sectionRepeat);
  const [startInput, setStartInput] = useState(() =>
    formatPosition(sectionRepeat.start ?? useSoundStore.getState().seek),
  );
  const [endInput, setEndInput] = useState(() =>
    sectionRepeat.end === null ? '' : formatPosition(sectionRepeat.end),
  );
  const [error, setError] = useState<string | null>(null);
  const active = sectionRepeat.start !== null && sectionRepeat.end !== null;

  const applyRange = (start: number | null, end: number | null) => {
    if (start === null || end === null) {
      setError(t('sectionRepeat.invalidTime'));
      return;
    }
    const sound = useSoundStore.getState();
    if (!isValidSectionRepeatRange(start, end, sound.duration)) {
      setError(t('sectionRepeat.invalidRange'));
      return;
    }
    if (sound.setSectionStart(start) && sound.setSectionEnd(end)) {
      setStartInput(formatPosition(start));
      setEndInput(formatPosition(end));
      setError(null);
    } else {
      setError(t('sectionRepeat.invalidRange'));
    }
  };

  const markStart = () => {
    const sound = useSoundStore.getState();
    if (!sound.setSectionStart()) {
      setError(t('sectionRepeat.invalidRange'));
      return;
    }
    setStartInput(formatPosition(sound.seek));
    setEndInput('');
    setError(null);
  };

  const clear = () => {
    useSoundStore.getState().clearSectionRepeat();
    setStartInput(formatPosition(useSoundStore.getState().seek));
    setEndInput('');
    setError(null);
  };

  return (
    <form
      className="flex flex-col gap-4"
      aria-label={t('sectionRepeat.title')}
      onSubmit={(event) => {
        event.preventDefault();
        applyRange(parsePosition(startInput), parsePosition(endInput));
      }}
    >
      <div>
        <h3 className="text-sm font-semibold">{t('sectionRepeat.title')}</h3>
        <p className="text-foreground/60 mt-1 text-xs">
          {t('sectionRepeat.hint')}
        </p>
      </div>
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <Input
          label={t('sectionRepeat.start')}
          value={startInput}
          onChange={(event) => setStartInput(event.target.value)}
          placeholder="0:00"
          size="sm"
          autoComplete="off"
          spellCheck={false}
        />
        <Tooltip content={t('sectionRepeat.markStart')} side="top">
          <Button
            size="icon-sm"
            variant="secondary"
            aria-label={t('sectionRepeat.markStart')}
            onClick={markStart}
          >
            <LocateFixed size={16} />
          </Button>
        </Tooltip>
        <Input
          label={t('sectionRepeat.end')}
          value={endInput}
          onChange={(event) => setEndInput(event.target.value)}
          placeholder="0:30"
          size="sm"
          autoComplete="off"
          spellCheck={false}
        />
        <Tooltip content={t('sectionRepeat.markEnd')} side="top">
          <Button
            size="icon-sm"
            variant="secondary"
            aria-label={t('sectionRepeat.markEnd')}
            onClick={() =>
              applyRange(
                parsePosition(startInput),
                useSoundStore.getState().seek,
              )
            }
          >
            <LocateFixed size={16} />
          </Button>
        </Tooltip>
      </div>
      <p
        className={
          active
            ? 'text-foreground text-xs font-semibold'
            : 'text-foreground/60 text-xs'
        }
        data-testid="section-repeat-status"
        aria-live="polite"
      >
        {active
          ? t('sectionRepeat.looping', {
              start: formatPosition(sectionRepeat.start ?? 0),
              end: formatPosition(sectionRepeat.end ?? 0),
            })
          : t('sectionRepeat.chooseRange')}
      </p>
      {error && (
        <p role="alert" className="text-accent-red text-xs">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" type="submit">
          {t('sectionRepeat.loop')}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={clear}
          disabled={sectionRepeat.start === null}
        >
          {t('sectionRepeat.clear')}
        </Button>
      </div>
    </form>
  );
};

export const ConnectedSectionRepeat: FC = () => {
  const { t } = useTranslation('playerBar');
  const currentItem = useQueueStore((state) => state.getCurrentItem());
  const { src, duration, sectionRepeat } = useSoundStore(
    useShallow((state) => ({
      src: state.src,
      duration: state.duration,
      sectionRepeat: state.sectionRepeat,
    })),
  );
  const active = sectionRepeat.start !== null && sectionRepeat.end !== null;
  const available =
    Boolean(currentItem && src) &&
    Number.isFinite(duration) &&
    duration >= SECTION_REPEAT_MIN_SECONDS;
  const buttonProps = {
    size: 'icon' as const,
    variant: active ? ('default' as const) : ('text' as const),
    'aria-label': t('sectionRepeat.title'),
    'aria-pressed': active,
    'data-testid': 'player-section-repeat-button',
    className:
      'text-xs font-semibold hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring',
    children: t('sectionRepeat.shortLabel'),
  };

  if (!available) {
    return (
      <Tooltip content={t('sectionRepeat.unavailable')} side="top">
        <Button {...buttonProps} disabled />
      </Tooltip>
    );
  }

  return (
    <Popover className="relative">
      <Tooltip content={t('sectionRepeat.title')} side="top">
        <PopoverButton as={Button} {...buttonProps} />
      </Tooltip>
      <PopoverPanel
        anchor="top end"
        transition
        className="surface-popover border-border text-foreground shadow-shadow z-50 w-80 max-w-[calc(100vw-2rem)] rounded-lg border-(length:--border-width) p-4 transition duration-150 ease-out [--anchor-gap:12px] data-closed:translate-y-1 data-closed:opacity-0 motion-reduce:transition-none"
      >
        <SectionRepeatPanel key={currentItem?.id} />
      </PopoverPanel>
    </Popover>
  );
};
