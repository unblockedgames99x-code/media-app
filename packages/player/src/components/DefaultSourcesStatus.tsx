import { FC } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import { Button } from '@nuclearplayer/ui';

import { initializeDefaultSources } from '../services/plugins/defaultSources';
import { useDefaultSourcesStore } from '../stores/defaultSourcesStore';

export const DefaultSourcesStatus: FC = () => {
  const { t } = useTranslation('defaultSources');
  const { phase, source } = useDefaultSourcesStore();
  if (phase === 'idle' || phase === 'ready') {
    return null;
  }

  return (
    <div
      role={phase === 'error' ? 'alert' : 'status'}
      data-testid="default-sources-status"
      className="bg-secondary text-foreground flex items-center justify-center gap-3 px-3 py-2 text-sm"
    >
      <span>
        {phase === 'error'
          ? t('error')
          : t('installing', { source: source ?? t('sources') })}
        <span className="text-muted-foreground ml-2">{t('available')}</span>
      </span>
      {phase === 'error' && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void initializeDefaultSources()}
        >
          {t('retry')}
        </Button>
      )}
    </div>
  );
};
