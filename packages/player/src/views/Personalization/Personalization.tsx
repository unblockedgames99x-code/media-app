import { ChangeEvent, FC, useRef, useState } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import { ViewShell } from '@nuclearplayer/ui';

import {
  readPersonalizationImage,
  savePersonalizationProfile,
} from '../../services/personalizationFiles';
import {
  getPersonalizationGradientEnd,
  getPersonalizationPalette,
} from '../../services/personalizationPalette';
import {
  personalizationPresets,
  PersonalizationSettings,
  usePersonalizationStore,
} from '../../stores/personalizationStore';
import {
  actionClass,
  ColorField,
  FieldGroup,
  RangeField,
  SelectField,
  TextField,
  ToggleField,
} from './PersonalizationFields';
import { PersonalizationPreview } from './PersonalizationPreview';
import { PersonalizationStorageWarning } from './PersonalizationStorageWarning';

type Notice = { kind: 'error' | 'success'; text: string } | null;
const tabs = [
  'style',
  'typography',
  'layout',
  'identity',
  'sound',
  'profiles',
] as const;

export const PersonalizationPresets: FC = () => {
  const { t } = useTranslation('personalization');
  const applyPreset = usePersonalizationStore((state) => state.applyPreset);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {personalizationPresets.map((preset) => (
        <button
          type="button"
          key={preset.id}
          className={`${actionClass} flex items-center justify-center gap-2`}
          onClick={() => applyPreset(preset.id)}
        >
          <span
            aria-hidden="true"
            className="size-4 shrink-0 rounded-full border"
            style={{
              background: preset.palette.accent,
              borderColor: preset.palette.border,
            }}
          />
          {t(`presets.${preset.id}`)}
        </button>
      ))}
    </div>
  );
};

export const IdentityPreferences: FC<{
  onNotice: (notice: Notice) => void;
}> = ({ onNotice }) => {
  const { t } = useTranslation('personalization');
  const identity = usePersonalizationStore((state) => state.settings.identity);
  const updateSection = usePersonalizationStore((state) => state.updateSection);
  const uploadLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    try {
      const logoDataUrl = await readPersonalizationImage(file);
      updateSection('identity', { logoDataUrl });
      onNotice(null);
    } catch {
      onNotice({ kind: 'error', text: t('images.invalid') });
    }
  };
  return (
    <FieldGroup
      title={t('identity.title')}
      description={t('identity.description')}
    >
      <TextField
        label={t('identity.name')}
        value={identity.displayName}
        onChange={(displayName) => updateSection('identity', { displayName })}
        maxLength={40}
      />
      <button
        type="button"
        className={actionClass}
        disabled={!identity.displayName}
        onClick={() => updateSection('identity', { displayName: '' })}
      >
        {t('identity.clearName')}
      </button>
      <label className="block space-y-2 text-sm font-semibold">
        <span>{t('identity.logo')}</span>
        <input
          className="block w-full text-sm"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={uploadLogo}
        />
      </label>
      <p className="text-muted-foreground text-xs">{t('images.hint')}</p>
      {identity.logoDataUrl && (
        <img
          className="size-16 object-contain"
          src={identity.logoDataUrl}
          alt={t('identity.logoPreview')}
        />
      )}
      <button
        type="button"
        className={actionClass}
        disabled={!identity.logoDataUrl}
        onClick={() => updateSection('identity', { logoDataUrl: '' })}
      >
        {t('identity.removeLogo')}
      </button>
    </FieldGroup>
  );
};

export const Personalization: FC = () => {
  const { t } = useTranslation('personalization');
  const {
    settings,
    updateSection,
    exportProfile,
    importProfile,
    reset,
    restartSetup,
  } = usePersonalizationStore();
  const palette = getPersonalizationPalette(settings.palette);
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>('style');
  const [profileJson, setProfileJson] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const tabElements = useRef(new Map<string, HTMLButtonElement>());
  const fontOptions = ['system', 'sans', 'serif', 'mono', 'custom'].map(
    (value) => ({ value, label: t(`typography.fonts.${value}`) }),
  );
  const importJson = (json: string) => {
    try {
      importProfile(json);
      setNotice({ kind: 'success', text: t('profiles.imported') });
    } catch {
      setNotice({ kind: 'error', text: t('profiles.invalid') });
    }
  };
  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    if (file.size > 5_700_000) {
      setNotice({ kind: 'error', text: t('profiles.invalid') });
      return;
    }
    try {
      const json = await file.text();
      setProfileJson(json);
      importJson(json);
    } catch {
      setNotice({ kind: 'error', text: t('profiles.invalid') });
    }
  };
  const uploadBackground = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    try {
      const imageDataUrl = await readPersonalizationImage(file);
      updateSection('background', { imageDataUrl, style: 'image' });
      setNotice(null);
    } catch {
      setNotice({ kind: 'error', text: t('images.invalid') });
    }
  };
  const saveFile = async () => {
    try {
      if (await savePersonalizationProfile(exportProfile())) {
        setNotice({ kind: 'success', text: t('profiles.saved') });
      }
    } catch {
      setNotice({ kind: 'error', text: t('profiles.saveFailed') });
    }
  };

  return (
    <ViewShell title={t('title')} classes={{ root: 'personalization-view' }}>
      <PersonalizationStorageWarning />
      <p className="text-muted-foreground mb-4 text-sm">{t('description')}</p>
      <div
        className="mb-5 flex flex-wrap gap-1"
        role="tablist"
        aria-label={t('categories')}
      >
        {tabs.map((tab, index) => (
          <button
            type="button"
            key={tab}
            id={`personalization-tab-${tab}`}
            ref={(element) => {
              if (element) {
                tabElements.current.set(tab, element);
              }
            }}
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls="personalization-panel"
            tabIndex={activeTab === tab ? 0 : -1}
            className={`rounded-md px-3 py-2 text-sm font-semibold ${activeTab === tab ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            onClick={() => {
              setActiveTab(tab);
              setNotice(null);
            }}
            onKeyDown={(event) => {
              const nextIndex =
                event.key === 'ArrowRight'
                  ? (index + 1) % tabs.length
                  : event.key === 'ArrowLeft'
                    ? (index - 1 + tabs.length) % tabs.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? tabs.length - 1
                        : -1;
              if (nextIndex !== -1) {
                event.preventDefault();
                setActiveTab(tabs[nextIndex]);
                tabElements.current.get(tabs[nextIndex])?.focus();
              }
            }}
          >
            {t(`tabs.${tab}`)}
          </button>
        ))}
      </div>
      <div className="grid min-w-0 gap-5 pb-8 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div
          id="personalization-panel"
          role="tabpanel"
          aria-labelledby={`personalization-tab-${activeTab}`}
          className="min-w-0 space-y-4"
        >
          {activeTab === 'style' && (
            <>
              <FieldGroup
                title={t('style.presets')}
                description={t('style.presetsHint')}
              >
                <PersonalizationPresets />
              </FieldGroup>
              <FieldGroup
                title={t('style.palette')}
                description={t('style.paletteHint')}
              >
                <ToggleField
                  label={t('style.overrideTheme')}
                  checked={settings.palette.enabled}
                  onChange={(enabled) => updateSection('palette', { enabled })}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  {(
                    [
                      'background',
                      'surface',
                      'foreground',
                      'muted',
                      'accent',
                      'accentForeground',
                      'border',
                    ] as const
                  ).map((key) => (
                    <ColorField
                      key={key}
                      label={t(`style.colors.${key}`)}
                      value={palette[key]}
                      onChange={(value) =>
                        updateSection('palette', { [key]: value })
                      }
                    />
                  ))}
                </div>
              </FieldGroup>
              <FieldGroup title={t('background.title')}>
                <SelectField
                  label={t('background.style')}
                  value={settings.background.style}
                  options={['solid', 'gradient', 'image'].map((value) => ({
                    value,
                    label: t(`background.styles.${value}`),
                  }))}
                  onChange={(style) =>
                    updateSection('background', {
                      style:
                        style as PersonalizationSettings['background']['style'],
                    })
                  }
                />
                {settings.background.style === 'gradient' && (
                  <>
                    <ColorField
                      label={t('background.gradientEnd')}
                      value={getPersonalizationGradientEnd(settings)}
                      onChange={(gradientEnd) =>
                        updateSection('background', { gradientEnd })
                      }
                    />
                    <RangeField
                      label={t('background.angle')}
                      value={settings.background.gradientAngle}
                      min={0}
                      max={360}
                      suffix="°"
                      onChange={(gradientAngle) =>
                        updateSection('background', { gradientAngle })
                      }
                    />
                  </>
                )}
                {settings.background.style === 'image' && (
                  <>
                    <label className="block space-y-2 text-sm font-semibold">
                      <span>{t('background.image')}</span>
                      <input
                        className="block w-full text-sm"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={uploadBackground}
                      />
                    </label>
                    <p className="text-muted-foreground text-xs">
                      {t('images.hint')}
                    </p>
                    <RangeField
                      label={t('background.opacity')}
                      value={settings.background.imageOpacity}
                      min={0}
                      max={60}
                      suffix="%"
                      onChange={(imageOpacity) =>
                        updateSection('background', { imageOpacity })
                      }
                    />
                    <RangeField
                      label={t('background.blur')}
                      value={settings.background.blur}
                      min={0}
                      max={24}
                      suffix="px"
                      onChange={(blur) => updateSection('background', { blur })}
                    />
                    <button
                      type="button"
                      className={actionClass}
                      disabled={!settings.background.imageDataUrl}
                      onClick={() =>
                        updateSection('background', {
                          imageDataUrl: '',
                          style: 'solid',
                        })
                      }
                    >
                      {t('background.remove')}
                    </button>
                  </>
                )}
              </FieldGroup>
            </>
          )}
          {activeTab === 'typography' && (
            <FieldGroup
              title={t('typography.title')}
              description={t('typography.hint')}
            >
              <SelectField
                label={t('typography.body')}
                value={settings.typography.bodyFont}
                options={fontOptions}
                onChange={(bodyFont) =>
                  updateSection('typography', {
                    bodyFont:
                      bodyFont as PersonalizationSettings['typography']['bodyFont'],
                  })
                }
              />
              {settings.typography.bodyFont === 'custom' && (
                <TextField
                  label={t('typography.customBody')}
                  value={settings.typography.customBodyFont}
                  maxLength={120}
                  onChange={(customBodyFont) =>
                    updateSection('typography', { customBodyFont })
                  }
                />
              )}
              <SelectField
                label={t('typography.heading')}
                value={settings.typography.headingFont}
                options={fontOptions}
                onChange={(headingFont) =>
                  updateSection('typography', {
                    headingFont:
                      headingFont as PersonalizationSettings['typography']['headingFont'],
                  })
                }
              />
              {settings.typography.headingFont === 'custom' && (
                <TextField
                  label={t('typography.customHeading')}
                  value={settings.typography.customHeadingFont}
                  maxLength={120}
                  onChange={(customHeadingFont) =>
                    updateSection('typography', { customHeadingFont })
                  }
                />
              )}
              <RangeField
                label={t('typography.size')}
                value={settings.typography.size}
                min={12}
                max={22}
                suffix="px"
                onChange={(size) => updateSection('typography', { size })}
              />
              <RangeField
                label={t('typography.lineHeight')}
                value={settings.typography.lineHeight}
                min={1.2}
                max={2}
                step={0.05}
                onChange={(lineHeight) =>
                  updateSection('typography', { lineHeight })
                }
              />
              <RangeField
                label={t('typography.weight')}
                value={settings.typography.weight}
                min={300}
                max={700}
                step={100}
                onChange={(weight) => updateSection('typography', { weight })}
              />
            </FieldGroup>
          )}
          {activeTab === 'layout' && (
            <>
              <FieldGroup title={t('layout.spacing')}>
                <SelectField
                  label={t('layout.density')}
                  value={settings.layout.density}
                  options={['compact', 'comfortable', 'spacious'].map(
                    (value) => ({
                      value,
                      label: t(`layout.densities.${value}`),
                    }),
                  )}
                  onChange={(density) =>
                    updateSection('layout', {
                      density:
                        density as PersonalizationSettings['layout']['density'],
                    })
                  }
                />
                <RangeField
                  label={t('layout.uiScale')}
                  value={settings.layout.uiScale}
                  min={80}
                  max={130}
                  suffix="%"
                  onChange={(uiScale) => updateSection('layout', { uiScale })}
                />
                <RangeField
                  label={t('layout.sidebarWidth')}
                  value={settings.layout.sidebarWidth}
                  min={160}
                  max={360}
                  suffix="px"
                  onChange={(sidebarWidth) =>
                    updateSection('layout', { sidebarWidth })
                  }
                />
                <ToggleField
                  label={t('layout.sidebarCollapsed')}
                  checked={settings.layout.sidebarCollapsed}
                  onChange={(sidebarCollapsed) =>
                    updateSection('layout', { sidebarCollapsed })
                  }
                />
                <RangeField
                  label={t('layout.contentWidth')}
                  value={settings.layout.contentWidth}
                  min={0}
                  max={1800}
                  step={100}
                  suffix="px"
                  onChange={(contentWidth) =>
                    updateSection('layout', { contentWidth })
                  }
                />
                <p className="text-muted-foreground text-xs">
                  {t('layout.contentWidthHint')}
                </p>
              </FieldGroup>
              <FieldGroup title={t('layout.surfaces')}>
                <RangeField
                  label={t('layout.radius')}
                  value={settings.layout.cornerRadius}
                  min={0}
                  max={24}
                  suffix="px"
                  onChange={(cornerRadius) =>
                    updateSection('layout', { cornerRadius })
                  }
                />
                <RangeField
                  label={t('layout.borderWidth')}
                  value={settings.layout.borderWidth}
                  min={0}
                  max={4}
                  step={0.5}
                  suffix="px"
                  onChange={(borderWidth) =>
                    updateSection('layout', { borderWidth })
                  }
                />
                <RangeField
                  label={t('layout.shadow')}
                  value={settings.layout.shadow}
                  min={0}
                  max={16}
                  suffix="px"
                  onChange={(shadow) => updateSection('layout', { shadow })}
                />
                <SelectField
                  label={t('layout.artworkShape')}
                  value={settings.layout.artworkShape}
                  options={['square', 'rounded', 'circle'].map((value) => ({
                    value,
                    label: t(`layout.shapes.${value}`),
                  }))}
                  onChange={(artworkShape) =>
                    updateSection('layout', {
                      artworkShape:
                        artworkShape as PersonalizationSettings['layout']['artworkShape'],
                    })
                  }
                />
                <RangeField
                  label={t('layout.saturation')}
                  value={settings.layout.artworkSaturation}
                  min={0}
                  max={150}
                  suffix="%"
                  onChange={(artworkSaturation) =>
                    updateSection('layout', { artworkSaturation })
                  }
                />
                <ToggleField
                  label={t('layout.showArtwork')}
                  checked={settings.layout.showArtwork}
                  onChange={(showArtwork) =>
                    updateSection('layout', { showArtwork })
                  }
                />
              </FieldGroup>
              <FieldGroup title={t('layout.behavior')}>
                <SelectField
                  label={t('layout.motion')}
                  value={settings.layout.motion}
                  options={['full', 'reduced', 'none'].map((value) => ({
                    value,
                    label: t(`layout.motions.${value}`),
                  }))}
                  onChange={(motion) =>
                    updateSection('layout', {
                      motion:
                        motion as PersonalizationSettings['layout']['motion'],
                    })
                  }
                />
                <ToggleField
                  label={t('layout.tooltips')}
                  checked={settings.layout.showTooltips}
                  onChange={(showTooltips) =>
                    updateSection('layout', { showTooltips })
                  }
                />
              </FieldGroup>
            </>
          )}
          {activeTab === 'identity' && (
            <IdentityPreferences onNotice={setNotice} />
          )}
          {activeTab === 'sound' && (
            <>
              <FieldGroup
                title={t('sound.interface')}
                description={t('sound.hint')}
              >
                <ToggleField
                  label={t('sound.enabled')}
                  checked={settings.sounds.enabled}
                  onChange={(enabled) => updateSection('sounds', { enabled })}
                />
                <RangeField
                  label={t('sound.volume')}
                  value={settings.sounds.volume}
                  min={0}
                  max={100}
                  suffix="%"
                  onChange={(volume) => updateSection('sounds', { volume })}
                />
                <SelectField
                  label={t('sound.tone')}
                  value={settings.sounds.tone}
                  options={['soft', 'bright', 'digital'].map((value) => ({
                    value,
                    label: t(`sound.tones.${value}`),
                  }))}
                  onChange={(tone) =>
                    updateSection('sounds', {
                      tone: tone as PersonalizationSettings['sounds']['tone'],
                    })
                  }
                />
                <ToggleField
                  label={t('sound.selection')}
                  checked={settings.sounds.selection}
                  onChange={(selection) =>
                    updateSection('sounds', { selection })
                  }
                />
                <ToggleField
                  label={t('sound.navigation')}
                  checked={settings.sounds.navigation}
                  onChange={(navigation) =>
                    updateSection('sounds', { navigation })
                  }
                />
                <ToggleField
                  label={t('sound.notification')}
                  checked={settings.sounds.notification}
                  onChange={(notification) =>
                    updateSection('sounds', { notification })
                  }
                />
                <button
                  type="button"
                  className={actionClass}
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent('personalization:preview-sound'),
                    )
                  }
                >
                  {t('sound.test')}
                </button>
              </FieldGroup>
              <FieldGroup
                title={t('audio.title')}
                description={t('audio.hint')}
              >
                <ToggleField
                  label={t('audio.enabled')}
                  checked={settings.audio.enabled}
                  onChange={(enabled) => updateSection('audio', { enabled })}
                />
                {(['bass', 'mid', 'treble'] as const).map((key) => (
                  <RangeField
                    key={key}
                    label={t(`audio.${key}`)}
                    value={settings.audio[key]}
                    min={-12}
                    max={12}
                    suffix="dB"
                    onChange={(value) =>
                      updateSection('audio', { [key]: value })
                    }
                  />
                ))}
                <RangeField
                  label={t('audio.balance')}
                  value={settings.audio.balance}
                  min={-1}
                  max={1}
                  step={0.1}
                  onChange={(balance) => updateSection('audio', { balance })}
                />
                <ToggleField
                  label={t('audio.mono')}
                  checked={settings.audio.mono}
                  onChange={(mono) => updateSection('audio', { mono })}
                />
                <button
                  type="button"
                  className={actionClass}
                  onClick={() =>
                    updateSection('audio', {
                      bass: 0,
                      mid: 0,
                      treble: 0,
                      balance: 0,
                      mono: false,
                    })
                  }
                >
                  {t('audio.reset')}
                </button>
              </FieldGroup>
            </>
          )}
          {activeTab === 'profiles' && (
            <>
              <FieldGroup
                title={t('profiles.title')}
                description={t('profiles.hint')}
              >
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={actionClass}
                    onClick={saveFile}
                  >
                    {t('profiles.save')}
                  </button>
                  <button
                    type="button"
                    className={actionClass}
                    onClick={() => {
                      setProfileJson(exportProfile());
                      setNotice({
                        kind: 'success',
                        text: t('profiles.exported'),
                      });
                    }}
                  >
                    {t('profiles.export')}
                  </button>
                </div>
                <label className="block space-y-2 text-sm font-semibold">
                  <span>{t('profiles.open')}</span>
                  <input
                    className="block w-full text-sm"
                    type="file"
                    accept="application/json,.json"
                    onChange={importFile}
                  />
                </label>
                <label className="block space-y-2 text-sm font-semibold">
                  <span>{t('profiles.json')}</span>
                  <textarea
                    className="bg-input text-input-foreground border-border min-h-44 w-full rounded-md border p-3 font-mono text-xs"
                    value={profileJson}
                    spellCheck={false}
                    onChange={(event) => setProfileJson(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className={actionClass}
                  disabled={!profileJson.trim()}
                  onClick={() => importJson(profileJson)}
                >
                  {t('profiles.import')}
                </button>
              </FieldGroup>
              <FieldGroup
                title={t('profiles.freshStart')}
                description={t('profiles.resetHint')}
              >
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={actionClass}
                    onClick={() => {
                      reset();
                      setNotice({
                        kind: 'success',
                        text: t('profiles.resetDone'),
                      });
                    }}
                  >
                    {t('profiles.reset')}
                  </button>
                  <button
                    type="button"
                    className={actionClass}
                    onClick={restartSetup}
                  >
                    {t('profiles.restart')}
                  </button>
                </div>
              </FieldGroup>
            </>
          )}
          {notice && (
            <p
              role={notice.kind === 'error' ? 'alert' : 'status'}
              className={`rounded-md border p-3 text-sm ${notice.kind === 'error' ? 'border-accent-red text-accent-red' : 'border-border text-foreground'}`}
            >
              {notice.text}
            </p>
          )}
        </div>
        <aside className="min-w-0 xl:sticky xl:top-0 xl:self-start">
          <h2 className="mb-2 text-sm font-bold">{t('preview.title')}</h2>
          <PersonalizationPreview settings={settings} />
          <p className="text-muted-foreground mt-3 text-xs">
            {t('preview.applied')}
          </p>
        </aside>
      </div>
    </ViewShell>
  );
};
