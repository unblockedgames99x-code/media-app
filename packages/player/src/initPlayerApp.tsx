import { getCurrentWindow } from '@tauri-apps/api/window';
import React from 'react';

import App from './App';
import { initLogStream } from './hooks/useLogStream';
import { applyThemeFromSettingsIfAny } from './services/advancedThemeService';
import { startAdvancedThemeWatcher } from './services/advancedThemeWatcher';
import { initBridgeHandler } from './services/bridge/bridgeHandler';
import { registerBuiltInCoreSettings } from './services/coreSettings';
import { initDiscordHandler } from './services/discordHandler';
import { initDiscoveryService } from './services/discoveryService';
import { initHistoryService } from './services/history';
import { initHttpApiHandler } from './services/httpApi';
import {
  applyLanguageFromSettings,
  initLanguageWatcher,
} from './services/languageService';
import { loadMarketplaceThemes } from './services/marketplaceThemeDirService';
import { initMcpHandler } from './services/mcp';
import { initMpdHandler } from './services/mpd';
import { initPlaybackEventBridge } from './services/playbackEventBridge';
import { hydratePluginsFromRegistry } from './services/plugins/pluginBootstrap';
import { ytdlpEnsureInstalled } from './services/tauri/commands';
import { initializeFavoritesStore } from './stores/favoritesStore';
import {
  flushPersonalizationPersistence,
  initializePersonalization,
} from './stores/personalizationStore';
import { initializePlaylistStore } from './stores/playlistStore';
import { initializeQueueStore } from './stores/queueStore';
import { initializeSettingsStore } from './stores/settingsStore';
import { initializeShortcutsStore } from './stores/shortcutsStore';
import { initializeStreamVerificationStore } from './stores/streamVerificationStore';
import { hydrateThemeStore } from './stores/themeStore';
import { useUpdaterStore } from './stores/updaterStore';

const initializeStores = () =>
  initializeSettingsStore()
    .then(() => initializeShortcutsStore())
    .then(() => initializeQueueStore())
    .then(() => initializeFavoritesStore())
    .then(() => initializeStreamVerificationStore())
    .then(() => initializePlaylistStore())
    .then(() => initializePersonalization());

const initRemoteControl = () =>
  initMcpHandler()
    .then(() => initMpdHandler())
    .then(() => initHttpApiHandler())
    .then(() => initBridgeHandler());

const initLanguage = () =>
  applyLanguageFromSettings().then(() => initLanguageWatcher());

const initThemes = () =>
  startAdvancedThemeWatcher()
    .then(() => loadMarketplaceThemes())
    .then(() => hydrateThemeStore())
    .then(() => applyThemeFromSettingsIfAny());

const startBackgroundTasks = () => {
  void hydratePluginsFromRegistry();
  void useUpdaterStore.getState().checkForUpdate();
  void ytdlpEnsureInstalled();
};

export const initPlayerApp = async (
  root: ReturnType<typeof import('react-dom/client').createRoot>,
) => {
  initLogStream();
  let closing = false;
  await getCurrentWindow().onCloseRequested(async (event) => {
    if (closing) {
      return;
    }
    event.preventDefault();
    await flushPersonalizationPersistence();
    closing = true;
    await getCurrentWindow().close();
  });

  await initializeStores()
    .then(() => registerBuiltInCoreSettings())
    .then(() => initDiscoveryService())
    .then(() => initRemoteControl())
    .then(() => initDiscordHandler())
    .then(() => initPlaybackEventBridge())
    .then(() => initHistoryService())
    .then(() => initLanguage())
    .then(() => initThemes())
    .then(() => startBackgroundTasks());

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
};
