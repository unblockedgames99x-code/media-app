import {
  Link,
  useCanGoBack,
  useRouter,
  useRouterState,
} from '@tanstack/react-router';
import { FC } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import { TopBar, TopBarNavigation } from '@nuclearplayer/ui';

import { useCanGoForward } from '../hooks/useCanGoForward';
import { useCoreSetting } from '../hooks/useCoreSetting';
import { useFramelessWindow } from '../hooks/useFramelessWindow';
import { usePersonalizationStore } from '../stores/personalizationStore';
import { ConnectedThemeController } from './ConnectedThemeController';
import { JamQrCodeButton } from './JamQrCodeButton';
import { SearchBox } from './SearchBox';
import { UpdateBadge } from './UpdateBadge';

export const ConnectedTopBar: FC = () => {
  const { t: tNavigation } = useTranslation('navigation');
  const videosOpen = useRouterState({
    select: (state) => state.location.pathname === '/videos',
  });
  const router = useRouter();
  const identity = usePersonalizationStore((state) => state.settings.identity);
  const canGoBack = useCanGoBack();
  const canGoForward = useCanGoForward();
  const frameless = useFramelessWindow();
  const [isTitleBarEnabled] = useCoreSetting<boolean>(
    'appearance.customTitleBar',
  );

  return (
    <TopBar
      draggable={frameless}
      className={
        videosOpen ? undefined : 'h-auto min-h-12 grid-rows-[3rem_auto] gap-y-0'
      }
    >
      <div className="flex flex-row items-center gap-4">
        {!isTitleBarEnabled &&
          (identity.displayName || identity.logoDataUrl) && (
            <span
              className="flex min-w-0 items-center gap-2"
              data-testid="personal-identity"
            >
              {identity.logoDataUrl && (
                <img
                  className="size-7 object-contain"
                  src={identity.logoDataUrl}
                  alt=""
                />
              )}
              {identity.displayName && (
                <span className="font-heading max-w-40 truncate font-bold">
                  {identity.displayName}
                </span>
              )}
            </span>
          )}
        {!videosOpen && (
          <TopBarNavigation
            onBack={() => router.history.back()}
            onForward={() => router.history.forward()}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
          />
        )}
        <UpdateBadge />
      </div>
      <nav
        aria-label={tNavigation('mediaType')}
        className="flex items-center justify-center gap-1"
      >
        <Link
          to="/dashboard"
          className={
            videosOpen
              ? 'rounded-md px-4 py-1 text-sm'
              : 'surface-primary border-border rounded-md border-(length:--border-width) px-4 py-1 text-sm font-bold'
          }
          aria-current={!videosOpen ? 'page' : undefined}
        >
          {tNavigation('music')}
        </Link>
        <Link
          to="/videos"
          className={
            videosOpen
              ? 'surface-primary border-border rounded-md border-(length:--border-width) px-4 py-1 text-sm font-bold'
              : 'rounded-md px-4 py-1 text-sm'
          }
          aria-current={videosOpen ? 'page' : undefined}
        >
          {tNavigation('videos')}
        </Link>
      </nav>
      <div className="flex flex-row items-center justify-end gap-2">
        <JamQrCodeButton />
        <ConnectedThemeController />
      </div>
      {!videosOpen && (
        <div className="col-span-3 mx-auto w-full max-w-3xl pb-2">
          <SearchBox />
        </div>
      )}
    </TopBar>
  );
};
