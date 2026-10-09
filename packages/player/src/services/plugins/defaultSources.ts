import { LazyStore } from '@tauri-apps/plugin-store';
import { z } from 'zod';

import { pluginMarketplaceApi } from '../../apis/pluginMarketplaceApi';
import { useDefaultSourcesStore } from '../../stores/defaultSourcesStore';
import { usePersonalizationStore } from '../../stores/personalizationStore';
import { useProvidersStore } from '../../stores/providersStore';
import { errorMessage } from '../../utils/errorMessage';
import { Logger } from '../logger';
import { providersHost } from '../providersHost';
import { installMarketplacePlugin } from './installMarketplacePlugin';
import { getRegistryEntry, listRegistryEntries } from './pluginRegistry';

const defaultSources = [
  {
    pluginId: 'nuclear-plugin-something',
    providerId: 'spotify',
    name: 'Spotify',
    kind: 'metadata',
  },
  {
    pluginId: 'nuclear-plugin-youtube',
    providerId: 'youtube',
    name: 'YouTube',
    kind: 'streaming',
  },
] as const;
const setupSchema = z
  .object({
    version: z.literal(1),
    completed: z.boolean(),
    completedPluginIds: z.array(
      z.enum(['nuclear-plugin-something', 'nuclear-plugin-youtube']),
    ),
  })
  .strict();
type SourceSetup = z.infer<typeof setupSchema>;
const store = new LazyStore('default-sources.json');
let running: Promise<void> | undefined;

const save = async (setup: SourceSetup) => {
  await store.set('setup', setup);
  await store.save();
};

const configure = async () => {
  const setupWasCompleted = usePersonalizationStore.getState().setupCompleted;
  const stored = await store.get<unknown>('setup');
  const setup: SourceSetup =
    stored === null || stored === undefined
      ? { version: 1, completed: false, completedPluginIds: [] }
      : setupSchema.parse(stored);
  if (setup.completed) {
    useDefaultSourcesStore.setState({ phase: 'ready' });
    return;
  }
  if (stored === null || stored === undefined) {
    const existing = await listRegistryEntries();
    if (
      setupWasCompleted ||
      existing.length > 0 ||
      Object.keys(useProvidersStore.getState().active).length > 0
    ) {
      await save({ ...setup, completed: true });
      useDefaultSourcesStore.setState({ phase: 'ready', source: undefined });
      return;
    }
    await save(setup);
  }

  useDefaultSourcesStore.setState({ phase: 'installing', source: undefined });
  const catalog = await pluginMarketplaceApi.getPlugins(
    AbortSignal.timeout(30000),
  );
  for (const source of defaultSources) {
    if (setup.completedPluginIds.includes(source.pluginId)) {
      continue;
    }
    const existing = await getRegistryEntry(source.pluginId);
    if (!existing) {
      const plugin = catalog.find(
        (plugin) =>
          plugin.id === source.pluginId &&
          plugin.repo === `NuclearPlayer/${source.pluginId}`,
      );
      if (!plugin) {
        throw new Error(
          `The ${source.name} source is unavailable in the plugin store.`,
        );
      }
      useDefaultSourcesStore.setState({ source: source.name });
      await installMarketplacePlugin(plugin, {
        signal: AbortSignal.timeout(30000),
        timeoutSeconds: 45,
        rollbackOnFailure: true,
      });
      if (!providersHost.get(source.providerId, source.kind)) {
        throw new Error(`The ${source.name} source did not become available.`);
      }
    }
    setup.completedPluginIds.push(source.pluginId);
    await save(setup);
  }
  await save({ ...setup, completed: true });
  useDefaultSourcesStore.setState({ phase: 'ready', source: undefined });
};

export const initializeDefaultSources = (): Promise<void> => {
  if (!running) {
    running = configure()
      .catch((error) => {
        Logger.plugins.warn(`Default music sources: ${errorMessage(error)}`);
        useDefaultSourcesStore.setState({ phase: 'error' });
      })
      .finally(() => {
        running = undefined;
      });
  }
  return running;
};
