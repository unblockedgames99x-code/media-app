import { useTranslation } from '@nuclearplayer/i18n';
import { SectionShell, Select } from '@nuclearplayer/ui';

import { useAdvancedThemeOptions } from '../../hooks/useAdvancedThemeOptions';
import { loadAndApplyAdvancedThemeFromFile } from '../../services/advancedThemeService';
import { usePersonalizationStore } from '../../stores/personalizationStore';
import { useThemeStore } from '../../stores/themeStore';

export const AdvancedThemeSelect = () => {
  const { t } = useTranslation('themes');
  const options = useAdvancedThemeOptions();
  const activeTheme = useThemeStore((state) => state.activeTheme);
  const value = activeTheme.type === 'advanced' ? activeTheme.path : '';

  return (
    <SectionShell data-testid="advanced-themes" title={t('advanced')}>
      <div className="max-w-80 p-1">
        <Select
          description={t('description')}
          placeholder={t('selectPlaceholder')}
          options={options}
          value={value}
          onValueChange={async (path) => {
            await loadAndApplyAdvancedThemeFromFile(path);
            usePersonalizationStore
              .getState()
              .updateSection('palette', { enabled: false });
          }}
        />
      </div>
    </SectionShell>
  );
};
