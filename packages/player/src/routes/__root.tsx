import {
  createRootRoute,
  Outlet,
  useRouter,
  useRouterState,
} from '@tanstack/react-router';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  CableIcon,
  DiscIcon,
  FilmIcon,
  GaugeIcon,
  HistoryIcon,
  ListMusicIcon,
  MicVocalIcon,
  MusicIcon,
  SettingsIcon,
  UserIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import {
  PlayerShell,
  PlayerWorkspace,
  RouteTransition,
  SidebarNavigation,
  SidebarNavigationItem,
  Toaster,
} from '@nuclearplayer/ui';

import { ConnectedPlayerBar } from '../components/ConnectedPlayerBar';
import {
  ConnectedQueuePanel,
  QueueHeaderActions,
} from '../components/ConnectedQueuePanel';
import { ConnectedSettingsModal } from '../components/ConnectedSettingsModal';
import { ConnectedStreamVerification } from '../components/ConnectedStreamVerification';
import { ConnectedTitleBar } from '../components/ConnectedTitleBar';
import { ConnectedTopBar } from '../components/ConnectedTopBar';
import { ConnectedVideoNavigation } from '../components/ConnectedVideoNavigation';
import { DevTools } from '../components/DevTools';
import { FlatpakWarningBanner } from '../components/FlatpakWarningBanner';
import { PersonalizationController } from '../components/PersonalizationController';
import { SoundProvider } from '../components/SoundProvider';
import { StreamResolver } from '../components/StreamResolver';
import { useVideoDeepLinks } from '../hooks/useVideoDeepLinks';
import { GlobalShortcuts } from '../shortcuts';
import { useLayoutStore } from '../stores/layoutStore';
import { usePersonalizationStore } from '../stores/personalizationStore';
import { useSettingsModalStore } from '../stores/settingsModalStore';
import { useStartupStore } from '../stores/startupStore';
import { PersonalizationSetup } from '../views/Personalization/PersonalizationSetup';

const RootComponent = () => {
  useVideoDeepLinks();
  const router = useRouter();
  useEffect(() => {
    let disposed = false;
    let unlisten: UnlistenFn | undefined;
    void listen('video-engine-return-to-music', () => {
      void router.navigate({ to: '/dashboard' });
    })
      .then((stop) => {
        if (disposed) {
          stop();
        } else {
          unlisten = stop;
        }
      })
      .catch(() => {});
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [router]);
  const videosOpen = useRouterState({
    select: (state) => state.location.pathname === '/videos',
  });
  const [videoFullscreen, setVideoFullscreen] = useState(false);
  const fullscreen = videosOpen && videoFullscreen;
  const { t } = useTranslation('navigation');
  const { t: tPrefs } = useTranslation('preferences');
  const {
    leftSidebar,
    rightSidebar,
    toggleLeftSidebar,
    toggleRightSidebar,
    setLeftSidebarWidth,
    setRightSidebarWidth,
  } = useLayoutStore();
  const openSettings = useSettingsModalStore((state) => state.open);
  const isStartingUp = useStartupStore((state) => state.isStartingUp);
  useEffect(() => {
    const window = getCurrentWindow();
    window.show().then(() => window.setFocus());
  }, []);

  useEffect(() => {
    if (!videosOpen) {
      setVideoFullscreen(false);
      return;
    }
    let disposed = false;
    let unlisten: UnlistenFn | undefined;
    void listen<boolean>('video-engine-fullscreen', ({ payload }) => {
      if (!disposed) {
        setVideoFullscreen(payload);
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
  }, [videosOpen]);

  return (
    <PlayerShell
      className={fullscreen ? 'grid-rows-[1fr]' : undefined}
      onContextMenu={(e) => e.preventDefault()}
    >
      <PersonalizationController />
      <PersonalizationSetup />
      <GlobalShortcuts playbackEnabled={!videosOpen} />
      {!fullscreen && (
        <div>
          <ConnectedTitleBar />
          <FlatpakWarningBanner />
          <ConnectedTopBar />
        </div>
      )}
      {!isStartingUp && <StreamResolver />}
      <SoundProvider>
        <PlayerWorkspace className={fullscreen ? 'grid-cols-[1fr]' : undefined}>
          {!fullscreen && (
            <PlayerWorkspace.LeftSidebar
              width={leftSidebar.width}
              isCollapsed={leftSidebar.isCollapsed}
              onWidthChange={(width) => {
                const nextWidth = Math.max(160, Math.min(360, width));
                setLeftSidebarWidth(nextWidth);
                usePersonalizationStore
                  .getState()
                  .updateSection('layout', { sidebarWidth: nextWidth });
              }}
              onToggle={() => {
                toggleLeftSidebar();
                usePersonalizationStore.getState().updateSection('layout', {
                  sidebarCollapsed:
                    useLayoutStore.getState().leftSidebar.isCollapsed,
                });
              }}
            >
              <SidebarNavigation isCompact={leftSidebar.isCollapsed}>
                <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
                  {videosOpen ? (
                    <>
                      <SidebarNavigationItem
                        to="/dashboard"
                        icon={<MusicIcon />}
                        label={t('music')}
                      />
                      {!leftSidebar.isCollapsed && (
                        <p className="text-muted-foreground mt-2 px-2 text-xs font-bold uppercase">
                          {t('videos')}
                        </p>
                      )}
                      <ConnectedVideoNavigation />
                    </>
                  ) : (
                    <>
                      <SidebarNavigationItem
                        to="/dashboard"
                        icon={<GaugeIcon />}
                        label={t('dashboard')}
                      />
                      <SidebarNavigationItem
                        to="/videos"
                        icon={<FilmIcon />}
                        label={t('videos')}
                      />
                      <SidebarNavigationItem
                        to="/favorites/albums"
                        icon={<DiscIcon />}
                        label={t('favoriteAlbums')}
                      />
                      <SidebarNavigationItem
                        to="/favorites/tracks"
                        icon={<MusicIcon />}
                        label={t('favoriteTracks')}
                      />
                      <SidebarNavigationItem
                        to="/favorites/artists"
                        icon={<UserIcon />}
                        label={t('favoriteArtists')}
                      />
                      <SidebarNavigationItem
                        to="/playlists"
                        icon={<ListMusicIcon />}
                        label={t('playlists')}
                      />
                      <SidebarNavigationItem
                        to="/history"
                        icon={<HistoryIcon />}
                        label={t('history')}
                      />
                      <SidebarNavigationItem
                        to="/lyrics"
                        icon={<MicVocalIcon />}
                        label={t('lyrics')}
                      />
                      <SidebarNavigationItem
                        to="/sources"
                        icon={<CableIcon />}
                        label={t('sources')}
                      />
                    </>
                  )}
                </div>
                <SidebarNavigationItem
                  icon={<SettingsIcon />}
                  label={tPrefs('title')}
                  onClick={() => openSettings()}
                />
              </SidebarNavigation>
            </PlayerWorkspace.LeftSidebar>
          )}

          <PlayerWorkspace.Main
            className={videosOpen ? 'min-w-0 overflow-hidden' : undefined}
          >
            {videosOpen ? <Outlet /> : <RouteTransition />}
          </PlayerWorkspace.Main>

          {!videosOpen && (
            <PlayerWorkspace.RightSidebar
              width={rightSidebar.width}
              isCollapsed={rightSidebar.isCollapsed}
              onWidthChange={setRightSidebarWidth}
              onToggle={toggleRightSidebar}
              headerActions={<QueueHeaderActions />}
              footer={<ConnectedStreamVerification />}
            >
              <ConnectedQueuePanel isCollapsed={rightSidebar.isCollapsed} />
            </PlayerWorkspace.RightSidebar>
          )}
        </PlayerWorkspace>
      </SoundProvider>

      {!videosOpen && <ConnectedPlayerBar />}
      <Toaster />
      <ConnectedSettingsModal />
      <DevTools />
    </PlayerShell>
  );
};

export const Route = createRootRoute({
  component: RootComponent,
});
