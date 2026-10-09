import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory, createRouter } from '@tanstack/react-router';
import { act, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

import App from './App';
import { routeTree } from './routeTree.gen';
import { useLayoutStore } from './stores/layoutStore';
import { usePersonalizationStore } from './stores/personalizationStore';
import { useStartupStore } from './stores/startupStore';

export const AppWrapper = {
  async mount() {
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/dashboard'] }),
    });
    const view = render(
      <App routerProp={router} queryClientProp={new QueryClient()} />,
    );
    await screen.findByTestId('player-workspace-main');
    return view;
  },

  get mediaType() {
    return screen.getByRole('navigation', { name: 'Media type' });
  },
  get header() {
    return screen.getByRole('banner');
  },
  get identity() {
    return screen.getByTestId('personal-identity');
  },
  chooseName(displayName: string) {
    act(() => {
      usePersonalizationStore
        .getState()
        .updateSection('identity', { displayName });
    });
  },

  mediaTab(name: string) {
    return {
      get element() {
        return within(AppWrapper.mediaType).getByRole('link', { name });
      },
      async click() {
        await userEvent.click(this.element);
      },
    };
  },

  get musicSearch() {
    return screen.getByTestId('search-box');
  },

  get videoNavigationHeading() {
    return within(screen.getByTestId('sidebar-left')).getByText('Videos');
  },

  useSidebarColors(foreground: string, contentMuted: string) {
    const style = document.createElement('style');
    style.textContent = `.surface-sidebar-left { color: ${foreground}; } .text-muted-foreground { color: ${contentMuted}; }`;
    document.head.append(style);
    return () => style.remove();
  },

  async videosOpened() {
    return screen.findByRole('region', { name: 'Videos' });
  },

  async musicOpened() {
    return screen.findByTestId('search-box');
  },

  async openPreferencesWithKeyboard() {
    screen.getByRole('button', { name: 'Preferences' }).focus();
    await userEvent.keyboard(' ');
    return screen.findByRole('heading', { name: 'General', level: 1 });
  },

  async searchMusic(query: string) {
    await userEvent.type(this.musicSearch, `${query}{Enter}`);
    return screen.findByTestId('search-view');
  },

  async toggleLeftSidebar() {
    const leftToggle = screen.getByTestId('sidebar-toggle-left');
    if (!leftToggle) {
      throw new Error('Left toggle not found');
    }
    await userEvent.click(leftToggle);
  },

  async toggleRightSidebar() {
    const rightToggle = screen.getByTestId('sidebar-toggle-right');
    if (!rightToggle) {
      throw new Error('Right toggle not found');
    }
    if (rightToggle) {
      await userEvent.click(rightToggle);
    }
  },

  getLayoutState() {
    return useLayoutStore.getState();
  },

  resetState() {
    usePersonalizationStore.getState().reset();
    usePersonalizationStore.setState({ setupCompleted: true, hydrated: true });
    useLayoutStore.setState({
      leftSidebar: { isCollapsed: false, width: 200 },
      rightSidebar: { isCollapsed: false, width: 200 },
    });
    useStartupStore.setState({ isStartingUp: false });
  },
};
