import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useTranslation } from '@nuclearplayer/i18n';

import type { MarketplacePlugin } from '../apis/pluginMarketplaceApi';
import { installMarketplacePlugin } from '../services/plugins/installMarketplacePlugin';
import { errorMessage } from '../utils/errorMessage';

type InstallPluginParams = {
  plugin: MarketplacePlugin;
};

export const useInstallPlugin = () => {
  const { t } = useTranslation('plugins');

  return useMutation({
    mutationFn: ({ plugin }: InstallPluginParams) =>
      installMarketplacePlugin(plugin),
    onError: (error, { plugin }) => {
      const message = errorMessage(error);
      toast.error(t('store.installError.title', { name: plugin.name }), {
        description: message,
      });
    },
  });
};
