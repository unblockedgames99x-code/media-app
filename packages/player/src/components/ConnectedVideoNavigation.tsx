import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import {
  FlameIcon,
  HistoryIcon,
  HouseIcon,
  InfoIcon,
  ListVideoIcon,
  RssIcon,
  SettingsIcon,
  UserRoundCogIcon,
  UsersIcon,
} from 'lucide-react';
import { FC, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { useTranslation } from '@nuclearplayer/i18n';
import { SidebarNavigationItem } from '@nuclearplayer/ui';

type HiddenNavigation = {
  trending: boolean;
  popular: boolean;
  playlists: boolean;
};
type VideoNavigationStatus = {
  path: string;
  hiddenNavigation: HiddenNavigation;
};

const SECTIONS = [
  { path: '/home', label: 'forYou', Icon: HouseIcon },
  { path: '/subscriptions', label: 'subscriptions', Icon: RssIcon },
  { path: '/subscribedchannels', label: 'channels', Icon: UsersIcon },
  { path: '/trending', label: 'trending', Icon: FlameIcon },
  { path: '/popular', label: 'popular', Icon: FlameIcon },
  { path: '/userplaylists', label: 'playlists', Icon: ListVideoIcon },
  { path: '/history', label: 'history', Icon: HistoryIcon },
  { path: '/settings', label: 'settings', Icon: SettingsIcon },
  { path: '/settings/profile', label: 'profiles', Icon: UserRoundCogIcon },
  { path: '/about', label: 'about', Icon: InfoIcon },
];

const isSectionSelected = (sectionPath: string, currentPath: string) => {
  if (sectionPath === '/settings/profile') {
    return currentPath.startsWith('/settings/profile');
  }
  if (sectionPath === '/settings') {
    return (
      currentPath.startsWith('/settings') &&
      !currentPath.startsWith('/settings/profile')
    );
  }
  return currentPath === sectionPath;
};

export const ConnectedVideoNavigation: FC = () => {
  const { t } = useTranslation('videos');
  const [selectedPath, setSelectedPath] = useState('/home');
  const [hiddenNavigation, setHiddenNavigation] = useState<HiddenNavigation>({
    trending: false,
    popular: false,
    playlists: false,
  });

  useEffect(() => {
    let disposed = false;
    let unlisten: UnlistenFn | undefined;
    void listen<VideoNavigationStatus>(
      'video-engine-navigation',
      ({ payload }) => {
        if (!disposed) {
          const path = payload.path
            .replace(/^#/, '')
            .split(/[?#]/)[0]
            .replace(/\/+$/, '');
          setSelectedPath(path || '/home');
          setHiddenNavigation(payload.hiddenNavigation);
        }
      },
    )
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

  const navigate = async (path: string) => {
    try {
      await invoke('video_engine_navigate', { path });
      setSelectedPath(path);
    } catch {
      toast.error(t('navigationFailure'));
    }
  };

  return (
    <>
      {SECTIONS.filter(
        ({ label }) => !hiddenNavigation[label as keyof HiddenNavigation],
      ).map(({ path, label, Icon }) => (
        <SidebarNavigationItem
          key={path}
          icon={<Icon />}
          label={t(`navigation.${label}`)}
          isSelected={isSectionSelected(path, selectedPath)}
          onClick={() => {
            void navigate(path);
          }}
        />
      ))}
    </>
  );
};
