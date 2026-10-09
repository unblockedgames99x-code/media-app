import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { FilmIcon, RotateCwIcon } from 'lucide-react';
import { FC, useEffect, useRef, useState } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import { Button } from '@nuclearplayer/ui';

import { usePersonalizationStore } from '../../stores/personalizationStore';
import { useSettingsModalStore } from '../../stores/settingsModalStore';
import { useSoundStore } from '../../stores/soundStore';
import { useVideoLinkStore } from '../../stores/videoLinkStore';

type VideoEngineState = 'loading' | 'ready' | 'error';
type VideoEngineResponse = { ready: boolean; pid: number | null };

const THEME_VARIABLES = [
  '--background',
  '--foreground',
  '--muted',
  '--muted-foreground',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--input',
  '--input-foreground',
  '--primary',
  '--primary-foreground',
  '--border',
  '--border-width',
  '--ring',
  '--radius-sm',
  '--radius-md',
  '--radius-lg',
  '--font-family',
  '--font-family-heading',
  '--font-size-base',
  '--line-height',
  '--font-weight-normal',
  '--density',
  '--artwork-radius',
  '--artwork-saturation',
  '--artwork-visible',
  '--motion-level',
  '--tooltips-visible',
  '--audio-enabled',
  '--audio-bass',
  '--audio-mid',
  '--audio-treble',
  '--audio-balance',
  '--audio-mono',
  '--sounds-enabled',
  '--sounds-volume',
  '--sounds-tone',
  '--sounds-selection',
  '--sounds-navigation',
  '--sounds-notification',
];

export const Videos: FC = () => {
  const { t } = useTranslation('videos');
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<VideoEngineState>('loading');
  const [attempt, setAttempt] = useState(0);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const settingsOpen = useSettingsModalStore((store) => store.isOpen);
  const setupCompleted = usePersonalizationStore(
    (store) => store.setupCompleted,
  );
  const pendingLink = useVideoLinkStore((store) => store.pending);
  const identity = usePersonalizationStore((store) => store.settings.identity);
  const background = usePersonalizationStore(
    (store) => store.settings.background,
  );

  useEffect(() => {
    if (state !== 'ready' || settingsOpen || !setupCompleted) {
      return;
    }
    const timer = setTimeout(() => {
      void invoke('video_engine_appearance', {
        appearance: {
          displayName: identity.displayName,
          logoDataUrl: identity.logoDataUrl,
          backgroundImage: background.imageDataUrl,
          backgroundStyle: background.style,
          gradientEnd: background.gradientEnd,
          gradientAngle: String(background.gradientAngle),
          imageOpacity: String(background.imageOpacity),
          blur: String(background.blur),
        },
      }).catch(() => {});
    }, 100);
    return () => clearTimeout(timer);
  }, [state, identity, background, settingsOpen, setupCompleted]);

  useEffect(() => {
    if (
      state !== 'ready' ||
      !pendingLink ||
      settingsOpen ||
      overlayOpen ||
      !setupCompleted
    ) {
      return;
    }
    let disposed = false;
    void invoke('video_engine_navigate', { path: pendingLink.path })
      .then(() => {
        if (!disposed) {
          useVideoLinkStore.getState().complete(pendingLink.sequence);
        }
      })
      .catch(() => {
        if (!disposed) {
          setState('error');
          void invoke('video_engine_hide').catch(() => {});
        }
      });
    return () => {
      disposed = true;
    };
  }, [pendingLink, state, settingsOpen, overlayOpen, setupCompleted]);

  useEffect(() => {
    const pauseMusic = () => {
      const music = useSoundStore.getState();
      if (music.status === 'playing') {
        music.pause();
      }
    };
    pauseMusic();
    return useSoundStore.subscribe(pauseMusic);
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: UnlistenFn | undefined;
    void listen<string>('video-engine-unavailable', () => {
      if (!disposed) {
        setState('error');
      }
    })
      .then((stopListening) => {
        if (disposed) {
          stopListening();
        } else {
          unlisten = stopListening;
        }
      })
      .catch(() => {});
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const updateOverlay = () => {
      setOverlayOpen(
        Boolean(document.querySelector('[data-headlessui-state~="open"]')),
      );
    };
    const overlayObserver = new MutationObserver(updateOverlay);
    overlayObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-headlessui-state'],
      childList: true,
      subtree: true,
    });
    updateOverlay();
    return () => overlayObserver.disconnect();
  }, []);

  useEffect(() => {
    if (settingsOpen || overlayOpen || !setupCompleted) {
      void invoke('video_engine_hide').catch(() => {});
      return;
    }

    const surface = surfaceRef.current;
    if (!surface) {
      return;
    }
    let disposed = false;
    let attaching = false;
    let attachAgain = false;
    let timer: ReturnType<typeof setTimeout>;
    let lastBounds = '';
    setState('loading');

    const syncTheme = () => {
      if (disposed) {
        return;
      }
      const style = getComputedStyle(document.documentElement);
      const variables = Object.fromEntries(
        THEME_VARIABLES.map((name) => [
          name,
          style.getPropertyValue(name).trim(),
        ]).filter(([, value]) => value),
      );
      void invoke('video_engine_theme', { variables }).catch(() => {});
    };

    const attach = async () => {
      if (disposed) {
        return;
      }
      if (attaching) {
        attachAgain = true;
        return;
      }
      const rect = surface.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) {
        return;
      }
      const bounds = {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
      const boundsKey = JSON.stringify(bounds);
      if (boundsKey === lastBounds) {
        return;
      }
      attaching = true;
      try {
        const response = await invoke<VideoEngineResponse>(
          'video_engine_attach',
          {
            bounds,
            visible: true,
          },
        );
        if (disposed) {
          return;
        }
        if (!response.ready) {
          throw new Error('Video engine not ready');
        }
        lastBounds = boundsKey;
        setState('ready');
        syncTheme();
      } catch {
        if (!disposed) {
          setState('error');
          void invoke('video_engine_hide').catch(() => {});
        }
      } finally {
        attaching = false;
        if (attachAgain && !disposed) {
          attachAgain = false;
          scheduleAttach();
        }
      }
    };

    const scheduleAttach = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void attach();
      }, 60);
    };
    const resizeObserver = new ResizeObserver(scheduleAttach);
    resizeObserver.observe(surface);
    window.addEventListener('resize', scheduleAttach);
    const themeObserver = new MutationObserver(() => {
      syncTheme();
      scheduleAttach();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-theme-id', 'style', 'class'],
    });
    themeObserver.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    scheduleAttach();

    return () => {
      disposed = true;
      clearTimeout(timer);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      window.removeEventListener('resize', scheduleAttach);
      void invoke('video_engine_hide').catch(() => {});
    };
  }, [attempt, settingsOpen, overlayOpen, setupCompleted]);

  return (
    <section
      aria-label={t('title')}
      role="region"
      data-testid="videos-view"
      className="surface-muted relative h-full min-h-0 w-full min-w-0 overflow-hidden"
    >
      <div
        ref={surfaceRef}
        data-testid="video-engine-surface"
        className="absolute inset-0"
      />
      <div
        className={
          state === 'ready'
            ? 'sr-only'
            : 'relative flex h-full flex-col items-center justify-center gap-4 p-8 text-center'
        }
      >
        {state === 'error' ? (
          <div
            role="alert"
            className="flex max-w-md flex-col items-center gap-4"
          >
            <FilmIcon className="size-10" aria-hidden="true" />
            <h1 className="text-2xl">{t('failureTitle')}</h1>
            <p className="text-muted-foreground">{t('failureHint')}</p>
            <Button onClick={() => setAttempt((value) => value + 1)}>
              <RotateCwIcon className="mr-2 size-4" aria-hidden="true" />
              {t('retry')}
            </Button>
          </div>
        ) : (
          <p role="status" className="text-muted-foreground">
            {state === 'ready' ? t('ready') : t('opening')}
          </p>
        )}
      </div>
    </section>
  );
};
