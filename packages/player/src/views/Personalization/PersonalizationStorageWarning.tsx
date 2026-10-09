import { FC, useState } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';

import {
  retryPersonalizationPersistence,
  usePersonalizationStore,
} from '../../stores/personalizationStore';
import { actionClass } from './PersonalizationFields';

export const PersonalizationStorageWarning: FC = () => {
  const { t } = useTranslation('personalization');
  const failed = usePersonalizationStore((state) => state.persistenceError);
  const [retrying, setRetrying] = useState(false);
  if (!failed) {
    return null;
  }
  return (
    <div
      role="alert"
      className="border-accent-red text-accent-red mb-4 space-y-3 rounded-md border p-3 text-sm"
    >
      <p>{t('profiles.persistenceError')}</p>
      <button
        type="button"
        className={actionClass}
        disabled={retrying}
        onClick={async () => {
          setRetrying(true);
          await retryPersonalizationPersistence();
          setRetrying(false);
        }}
      >
        {retrying ? t('setup.saving') : t('profiles.retrySave')}
      </button>
    </div>
  );
};
