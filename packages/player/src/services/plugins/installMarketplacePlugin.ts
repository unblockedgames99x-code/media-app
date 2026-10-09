import {
  pluginMarketplaceApi,
  type MarketplacePlugin,
} from '../../apis/pluginMarketplaceApi';
import { usePluginStore } from '../../stores/pluginStore';
import { cleanupDownload, downloadAndExtractPlugin } from './pluginDownloader';
import { upsertRegistryEntry } from './pluginRegistry';

type InstallationOptions = {
  signal?: AbortSignal;
  timeoutSeconds?: number;
  rollbackOnFailure?: boolean;
};

export const installMarketplacePlugin = async (
  plugin: MarketplacePlugin,
  options: InstallationOptions = {},
) => {
  const release = await pluginMarketplaceApi.getLatestRelease(
    plugin.repo,
    options.signal,
  );
  const extractedPath = await downloadAndExtractPlugin({
    pluginId: plugin.id,
    downloadUrl: release.downloadUrl,
    timeoutSeconds: options.timeoutSeconds,
  });

  try {
    const now = new Date().toISOString();
    await upsertRegistryEntry({
      id: plugin.id,
      version: release.version,
      path: extractedPath,
      installationMethod: 'store',
      enabled: false,
      installedAt: now,
      lastUpdatedAt: now,
    });
    await usePluginStore.getState().loadPluginFromPath(extractedPath);
    await usePluginStore.getState().enablePlugin(plugin.id);
  } catch (error) {
    if (options.rollbackOnFailure) {
      await usePluginStore.getState().removePlugin(plugin.id);
    }
    throw error;
  } finally {
    await cleanupDownload(plugin.id);
  }

  return { plugin, version: release.version };
};
