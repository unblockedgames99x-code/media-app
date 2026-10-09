import '../test/mocks/plugin-fs';

import { mockIPC } from '@tauri-apps/api/mocks';
import { waitFor } from '@testing-library/react';

import { initializeDefaultSources } from '../services/plugins/defaultSources';
import { providersHost } from '../services/providersHost';
import { useDefaultSourcesStore } from '../stores/defaultSourcesStore';
import { usePersonalizationStore } from '../stores/personalizationStore';
import { usePluginStore } from '../stores/pluginStore';
import { useProvidersStore } from '../stores/providersStore';
import { MarketplacePluginBuilder } from '../test/builders/MarketplacePluginBuilder';
import { MetadataProviderBuilder } from '../test/builders/MetadataProviderBuilder';
import { FetchMock } from '../test/mocks/fetch';
import { PluginFsMock } from '../test/mocks/plugin-fs';
import {
  LazyStore,
  resetInMemoryTauriStore,
} from '../test/utils/inMemoryTauriStore';
import { seedRegistryEntry } from '../test/utils/seedPlugins';
import { AppData, createPluginFolder } from '../test/utils/testPluginFolder';
import { DefaultSourcesWrapper } from './DefaultSourcesStatus.test-wrapper';

const defaults = [
  {
    id: 'nuclear-plugin-something',
    provider: 'spotify',
    name: 'Spotify',
    kind: 'metadata',
  },
  {
    id: 'nuclear-plugin-youtube',
    provider: 'youtube',
    name: 'YouTube',
    kind: 'streaming',
  },
] as const;

const seedMarketplace = () => {
  FetchMock.get('plugin-registry', {
    version: 1,
    plugins: defaults.map((source) =>
      new MarketplacePluginBuilder()
        .withId(source.id)
        .withName(source.name)
        .withRepo(`NuclearPlayer/${source.id}`)
        .build(),
    ),
  });
  for (const source of defaults) {
    FetchMock.get(`/repos/NuclearPlayer/${source.id}/releases/latest`, {
      tag_name: 'v1.0.0',
      name: source.name,
      published_at: '2026-10-09T00:00:00Z',
      assets: [
        {
          name: 'plugin.zip',
          browser_download_url: `https://example.com/${source.id}.zip`,
          size: 100,
        },
      ],
    });
    createPluginFolder(`${AppData}/plugins/.downloads/${source.id}`, {
      id: source.id,
      displayName: source.name,
      main: 'index.js',
    });
    const code = `module.exports = { onEnable(api) { api.Providers.register({ id: '${source.provider}', name: '${source.name}', kind: '${source.kind}', searchCapabilities: ['tracks'], searchTracks: async () => [], searchForTrack: async () => [], getStreamUrl: async () => ({url: 'https://example.com/audio.mp3'}) }); }, onDisable(api) { api.Providers.unregister('${source.provider}'); } };`;
    PluginFsMock.setReadTextFileByMap({
      [`${AppData}/plugins/.downloads/${source.id}/index.js`]: code,
      [`${AppData}/plugins/${source.id}/1.0.0/index.js`]: code,
    });
  }
};

describe('First launch music sources', () => {
  beforeEach(() => {
    resetInMemoryTauriStore();
    PluginFsMock.reset();
    FetchMock.init();
    providersHost.clear();
    usePluginStore.setState({ plugins: {} });
    useDefaultSourcesStore.setState({ phase: 'idle' });
    usePersonalizationStore.setState({ setupCompleted: false, hydrated: true });
    seedMarketplace();
    mockIPC(() => undefined);
  });

  it('installs and selects working Spotify metadata and YouTube streaming providers', async () => {
    await initializeDefaultSources();
    await DefaultSourcesWrapper.mount();

    expect(DefaultSourcesWrapper.section('metadata').select).toHaveTextContent(
      'Spotify',
    );
    expect(DefaultSourcesWrapper.section('streaming').select).toHaveTextContent(
      'YouTube',
    );
    expect(
      usePluginStore
        .getState()
        .getAllPlugins()
        .every((plugin) => plugin.enabled),
    ).toBe(true);
  });

  it('preserves an existing provider choice and installed disabled plugins', async () => {
    providersHost.register(
      new MetadataProviderBuilder()
        .withId('existing')
        .withName('My source')
        .build(),
    );
    await seedRegistryEntry({ id: 'nuclear-plugin-youtube', enabled: false });

    await initializeDefaultSources();
    await DefaultSourcesWrapper.mount();

    expect(DefaultSourcesWrapper.section('metadata').select).toHaveTextContent(
      'My source',
    );
    expect(usePluginStore.getState().getAllPlugins()).toHaveLength(0);
    expect(useProvidersStore.getState().active).toEqual({
      metadata: 'existing',
    });
  });

  it('does not install defaults into an existing completed setup with no plugins', async () => {
    usePersonalizationStore.setState({ setupCompleted: true });
    await initializeDefaultSources();
    expect(usePluginStore.getState().getAllPlugins()).toHaveLength(0);
  });

  it('keeps the app usable after a partial download failure and retries only the missing source', async () => {
    let failYouTube = true;
    mockIPC((command, args) => {
      if (
        command === 'download_file' &&
        String(args.url).includes('youtube') &&
        failYouTube
      ) {
        throw new Error('Network unavailable');
      }
    });
    await initializeDefaultSources();
    await DefaultSourcesWrapper.mount();
    expect(DefaultSourcesWrapper.status).toHaveTextContent(
      'Could not finish setting up music sources',
    );
    expect(DefaultSourcesWrapper.section('metadata').select).toHaveTextContent(
      'Spotify',
    );

    await usePluginStore.getState().disablePlugin('nuclear-plugin-something');
    failYouTube = false;
    await DefaultSourcesWrapper.retry.click();

    await waitFor(() =>
      expect(
        DefaultSourcesWrapper.section('streaming').select,
      ).toHaveTextContent('YouTube'),
    );
    expect(
      usePluginStore.getState().getPlugin('nuclear-plugin-something')?.enabled,
    ).toBe(false);
    expect(useDefaultSourcesStore.getState().phase).toBe('ready');
  });

  it('respects removing defaults after successful first setup across the next launch', async () => {
    await initializeDefaultSources();
    await usePluginStore.getState().removePlugin('nuclear-plugin-something');
    await usePluginStore.getState().removePlugin('nuclear-plugin-youtube');

    await initializeDefaultSources();
    expect(usePluginStore.getState().getAllPlugins()).toHaveLength(0);
    expect(useProvidersStore.getState().active).toEqual({});
    expect(
      await new LazyStore('default-sources.json').get('setup'),
    ).toMatchObject({ completed: true });
  });
});
