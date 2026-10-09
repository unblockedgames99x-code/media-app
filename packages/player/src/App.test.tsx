import { QueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

import App from './App';
import { AppWrapper } from './App.test-wrapper';

describe('App', () => {
  beforeEach(() => {
    AppWrapper.resetState();
  });

  it('should render snapshot', async () => {
    const component = render(<App queryClientProp={new QueryClient()} />);
    await screen.findByTestId('player-workspace-main');
    expect(component.asFragment()).toMatchSnapshot();
  });

  it('should handle sidebar collapse/expand user flow', async () => {
    render(<App queryClientProp={new QueryClient()} />);

    expect(AppWrapper.getLayoutState().leftSidebar.isCollapsed).toBe(false);
    expect(AppWrapper.getLayoutState().rightSidebar.isCollapsed).toBe(false);

    await AppWrapper.toggleLeftSidebar();
    expect(AppWrapper.getLayoutState().leftSidebar.isCollapsed).toBe(true);
    expect(AppWrapper.getLayoutState().rightSidebar.isCollapsed).toBe(false);

    await AppWrapper.toggleRightSidebar();
    expect(AppWrapper.getLayoutState().leftSidebar.isCollapsed).toBe(true);
    expect(AppWrapper.getLayoutState().rightSidebar.isCollapsed).toBe(true);

    await AppWrapper.toggleLeftSidebar();
    expect(AppWrapper.getLayoutState().leftSidebar.isCollapsed).toBe(false);
    expect(AppWrapper.getLayoutState().rightSidebar.isCollapsed).toBe(true);

    await AppWrapper.toggleRightSidebar();
    expect(AppWrapper.getLayoutState().leftSidebar.isCollapsed).toBe(false);
    expect(AppWrapper.getLayoutState().rightSidebar.isCollapsed).toBe(false);

    await AppWrapper.toggleLeftSidebar();
    await AppWrapper.toggleLeftSidebar();
    expect(AppWrapper.getLayoutState().leftSidebar.isCollapsed).toBe(false);
  });

  it('keeps Music and Videos available in the top bar across both workspaces', async () => {
    await AppWrapper.mount();
    expect(AppWrapper.mediaTab('Music').element).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(AppWrapper.mediaTab('Videos').element).toBeVisible();
    expect(AppWrapper.musicSearch).toBeVisible();
    await AppWrapper.mediaTab('Videos').click();
    await AppWrapper.videosOpened();
    expect(AppWrapper.mediaTab('Videos').element).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(AppWrapper.mediaTab('Music').element).toBeVisible();
    await AppWrapper.mediaTab('Music').click();
    await AppWrapper.musicOpened();
    expect(AppWrapper.mediaTab('Music').element).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(AppWrapper.mediaTab('Videos').element).toBeVisible();
    expect(AppWrapper.musicSearch).toBeEnabled();
    const results = await AppWrapper.searchMusic('Radiohead');
    expect(results).toHaveTextContent('Radiohead');
    expect(AppWrapper.mediaTab('Music').element).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(AppWrapper.mediaTab('Videos').element).toBeVisible();
  });

  it('keeps the header unbranded until the user chooses an identity', async () => {
    await AppWrapper.mount();
    expect(AppWrapper.header).not.toHaveTextContent('CarterMedia');
    expect(AppWrapper.header).not.toHaveTextContent('Nuclear');
    AppWrapper.chooseName('Evening room');
    expect(AppWrapper.identity).toHaveTextContent('Evening room');
    expect(document.title).toBe('Evening room');
  });

  it('opens sidebar Preferences with Space while the music playback shortcut is active', async () => {
    await AppWrapper.mount();
    expect(await AppWrapper.openPreferencesWithKeyboard()).toBeVisible();
  });

  it.each([
    ['light', '#20242b', '#666666', 'rgb(32, 36, 43)'],
    ['dark', '#f0f2f5', '#aaaaaa', 'rgb(240, 242, 245)'],
    ['custom blue sidebar', '#ffffff', '#000000', 'rgb(255, 255, 255)'],
  ])(
    'keeps the Videos heading readable on the %s theme sidebar',
    async (_name, foreground, contentMuted, expectedColor) => {
      const removeTheme = AppWrapper.useSidebarColors(foreground, contentMuted);
      await AppWrapper.mount();
      await AppWrapper.mediaTab('Videos').click();
      await AppWrapper.videosOpened();

      expect(getComputedStyle(AppWrapper.videoNavigationHeading).color).toBe(
        expectedColor,
      );
      removeTheme();
    },
  );
});
