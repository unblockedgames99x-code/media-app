import { HeadphonesIcon, PlayIcon } from 'lucide-react';
import { CSSProperties, FC } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';

import {
  getPersonalizationGradientEnd,
  getPersonalizationPalette,
} from '../../services/personalizationPalette';
import { PersonalizationSettings } from '../../stores/personalizationStore';

export const personalizationFont = (
  choice: PersonalizationSettings['typography']['bodyFont'],
  custom: string,
): string =>
  ({
    system: 'system-ui, sans-serif',
    sans: '"DM Sans", sans-serif',
    serif: 'Georgia, "Times New Roman", serif',
    mono: '"Space Mono", monospace',
    custom: custom || 'system-ui, sans-serif',
  })[choice];

export const PersonalizationPreview: FC<{
  settings: PersonalizationSettings;
}> = ({ settings }) => {
  const { t } = useTranslation('personalization');
  const { typography, layout, identity, background } = settings;
  const palette = getPersonalizationPalette(settings.palette);
  const radius =
    layout.artworkShape === 'circle'
      ? '50%'
      : layout.artworkShape === 'square'
        ? 0
        : layout.cornerRadius;
  const style: CSSProperties = {
    backgroundColor: palette.background,
    color: palette.foreground,
    fontFamily: personalizationFont(
      typography.bodyFont,
      typography.customBodyFont,
    ),
    fontSize: typography.size,
    lineHeight: typography.lineHeight,
    fontWeight: typography.weight,
    borderColor: palette.border,
    borderRadius: layout.cornerRadius,
    backgroundImage:
      background.style === 'gradient'
        ? `linear-gradient(${background.gradientAngle}deg, ${palette.background}, ${getPersonalizationGradientEnd(settings)})`
        : undefined,
  };
  return (
    <section
      aria-label={t('preview.title')}
      data-preset-preview="custom"
      className="relative overflow-hidden border p-4"
      style={style}
    >
      {background.style === 'image' && background.imageDataUrl && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url("${background.imageDataUrl}")`,
            opacity: background.imageOpacity / 100,
            filter: `blur(${background.blur}px)`,
          }}
        />
      )}
      <div className="relative space-y-4">
        <div
          className="flex min-h-7 items-center gap-2 border-b pb-3"
          style={{ borderColor: palette.border }}
        >
          {identity.logoDataUrl && (
            <img
              className="size-6 object-contain"
              src={identity.logoDataUrl}
              alt=""
            />
          )}
          {identity.displayName && (
            <span className="min-w-0 truncate font-bold">
              {identity.displayName}
            </span>
          )}
          <span className="ml-auto text-xs" style={{ color: palette.muted }}>
            {t('preview.music')}
          </span>
          <span
            className="rounded px-2 py-1 text-xs"
            style={{
              background: palette.accent,
              color: palette.accentForeground,
            }}
          >
            {t('preview.videos')}
          </span>
        </div>
        <div
          className="flex items-center gap-4"
          style={{ padding: layout.density === 'spacious' ? 8 : 0 }}
        >
          {layout.showArtwork && (
            <div
              className="grid size-20 shrink-0 place-items-center"
              style={{
                borderRadius: radius,
                background: palette.surface,
                color: palette.accent,
                filter: `saturate(${layout.artworkSaturation}%)`,
              }}
            >
              <HeadphonesIcon aria-hidden="true" size={32} />
            </div>
          )}
          <div className="min-w-0">
            <h3
              className="font-bold"
              style={{
                fontFamily: personalizationFont(
                  typography.headingFont,
                  typography.customHeadingFont,
                ),
              }}
            >
              {t('preview.mix')}
            </h3>
            <p className="mt-1 text-xs" style={{ color: palette.muted }}>
              {t('preview.subtitle')}
            </p>
          </div>
        </div>
        <div
          className="flex items-center gap-3 rounded p-3"
          style={{
            background: palette.surface,
            borderRadius: layout.cornerRadius,
          }}
        >
          <span
            className="grid size-8 shrink-0 place-items-center rounded-full"
            style={{
              background: palette.accent,
              color: palette.accentForeground,
            }}
          >
            <PlayIcon aria-hidden="true" size={14} />
          </span>
          <span
            className="h-1 flex-1 rounded-full"
            style={{ background: palette.border }}
          >
            <span
              className="block h-full w-2/5 rounded-full"
              style={{ background: palette.accent }}
            />
          </span>
          <span className="text-xs" style={{ color: palette.muted }}>
            2:34
          </span>
        </div>
        <p className="text-xs" style={{ color: palette.muted }}>
          {t('preview.hint')}
        </p>
      </div>
    </section>
  );
};
