import { FC, useState } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import { Dialog } from '@nuclearplayer/ui';

import {
  PersonalizationSettings,
  usePersonalizationStore,
} from '../../stores/personalizationStore';
import { IdentityPreferences, PersonalizationPresets } from './Personalization';
import {
  actionClass,
  SelectField,
  TextField,
  ToggleField,
} from './PersonalizationFields';
import { PersonalizationPreview } from './PersonalizationPreview';

const SetupWizard: FC = () => {
  const { t } = useTranslation('personalization');
  const { settings, updateSection, completeSetup, reset } =
    usePersonalizationStore();
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const persistenceError = usePersonalizationStore(
    (state) => state.persistenceError,
  );
  const steps = ['welcome', 'style', 'identity', 'preferences'] as const;
  const finish = async (useDefaults = false) => {
    if (saving) {
      return;
    }
    setSaving(true);
    setError('');
    if (useDefaults) {
      reset();
    }
    try {
      await completeSetup();
    } catch {
      setError(t('profiles.persistenceError'));
      setSaving(false);
    }
  };
  return (
    <Dialog.Root
      isOpen
      onClose={() => {
        void finish();
      }}
      showCloseButton={false}
      className="max-h-[calc(100dvh-2rem)] max-w-4xl overflow-y-auto"
    >
      <Dialog.Title>{t('setup.title')}</Dialog.Title>
      <Dialog.Description>{t('setup.description')}</Dialog.Description>
      <ol
        className="my-5 flex flex-wrap gap-x-4 gap-y-2 text-xs"
        aria-label={t('setup.dialog')}
      >
        {steps.map((entry, index) => (
          <li
            key={entry}
            className={
              index === step
                ? 'text-primary font-bold'
                : 'text-muted-foreground'
            }
            aria-current={index === step ? 'step' : undefined}
          >
            {index + 1}. {t(`setup.steps.${entry}`)}
          </li>
        ))}
      </ol>
      <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-4">
          <h2
            className="text-xl font-bold"
            aria-live="polite"
            aria-atomic="true"
          >
            {t(`setup.steps.${steps[step]}`)}
          </h2>
          {step === 0 && (
            <>
              <p>{t('setup.welcome')}</p>
              <p className="text-muted-foreground text-sm">
                {t('setup.welcomeHint')}
              </p>
            </>
          )}
          {step === 1 && (
            <>
              <p className="text-muted-foreground text-sm">
                {t('style.presetsHint')}
              </p>
              <PersonalizationPresets />
            </>
          )}
          {step === 2 && (
            <IdentityPreferences
              onNotice={(notice) =>
                setError(notice?.kind === 'error' ? notice.text : '')
              }
            />
          )}
          {step === 3 && (
            <>
              <SelectField
                label={t('setup.font')}
                value={settings.typography.bodyFont}
                options={['system', 'sans', 'serif', 'mono', 'custom'].map(
                  (value) => ({
                    value,
                    label: t(`typography.fonts.${value}`),
                  }),
                )}
                onChange={(bodyFont) =>
                  updateSection('typography', {
                    bodyFont:
                      bodyFont as PersonalizationSettings['typography']['bodyFont'],
                    headingFont:
                      bodyFont as PersonalizationSettings['typography']['headingFont'],
                  })
                }
              />
              {settings.typography.bodyFont === 'custom' && (
                <TextField
                  label={t('typography.customBody')}
                  value={settings.typography.customBodyFont}
                  maxLength={120}
                  onChange={(customBodyFont) =>
                    updateSection('typography', {
                      customBodyFont,
                      customHeadingFont: customBodyFont,
                    })
                  }
                />
              )}
              <SelectField
                label={t('setup.density')}
                value={settings.layout.density}
                options={['compact', 'comfortable', 'spacious'].map(
                  (value) => ({ value, label: t(`layout.densities.${value}`) }),
                )}
                onChange={(density) =>
                  updateSection('layout', {
                    density:
                      density as PersonalizationSettings['layout']['density'],
                  })
                }
              />
              <ToggleField
                label={t('setup.sounds')}
                checked={settings.sounds.enabled}
                onChange={(enabled) => updateSection('sounds', { enabled })}
              />
              <p className="text-muted-foreground text-sm">
                {t('setup.lastHint')}
              </p>
            </>
          )}
          {(error || persistenceError) && (
            <p role="alert" className="text-accent-red text-sm">
              {error || t('profiles.persistenceError')}
            </p>
          )}
        </div>
        <PersonalizationPreview settings={settings} />
      </div>
      <Dialog.Actions>
        <div className="mt-5 flex w-full flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            className="text-muted-foreground text-sm underline underline-offset-4"
            disabled={saving}
            onClick={() => {
              void finish(true);
            }}
          >
            {t('setup.skip')}
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                type="button"
                className={actionClass}
                disabled={saving}
                onClick={() => {
                  setError('');
                  setStep(step - 1);
                }}
              >
                {t('setup.back')}
              </button>
            )}
            <button
              type="button"
              className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-bold"
              disabled={saving}
              onClick={() => {
                setError('');
                if (step === steps.length - 1) {
                  void finish();
                } else {
                  setStep(step + 1);
                }
              }}
            >
              {saving
                ? t('setup.saving')
                : step === steps.length - 1
                  ? t('setup.finish')
                  : t('setup.next')}
            </button>
          </div>
        </div>
      </Dialog.Actions>
    </Dialog.Root>
  );
};

export const PersonalizationSetup: FC = () => {
  const completed = usePersonalizationStore((state) => state.setupCompleted);
  const hydrated = usePersonalizationStore((state) => state.hydrated);
  return completed || !hydrated ? null : <SetupWizard />;
};
