import type { PersonalizationSettings } from '../stores/personalizationStore';

type Palette = PersonalizationSettings['palette'];

const channels = (color: string) =>
  [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16));

export const colorLuminance = (color: string): number => {
  const linear = channels(color).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
};

export const colorContrast = (first: string, second: string): number => {
  const luminances = [colorLuminance(first), colorLuminance(second)];
  return (Math.max(...luminances) + 0.05) / (Math.min(...luminances) + 0.05);
};

const tone = (color: string, luminance: number): string => {
  const original = channels(color);
  const destination = colorLuminance(color) < luminance ? 255 : 0;
  let lower = 0;
  let upper = 1;
  let result = color;
  for (let iteration = 0; iteration < 16; iteration++) {
    const amount = (lower + upper) / 2;
    result = `#${original
      .map((channel) =>
        Math.round(channel + (destination - channel) * amount)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')}`;
    const belowTarget = colorLuminance(result) < luminance;
    if (belowTarget === (destination === 255)) {
      lower = amount;
    } else {
      upper = amount;
    }
  }
  return result;
};

export const isPersonalizationDark = (palette: Palette): boolean =>
  palette.mode === 'original'
    ? colorLuminance(palette.background) < 0.179
    : palette.mode === 'dark';

const isCompanion = (palette: Palette): boolean => {
  const originalIsDark = colorLuminance(palette.background) < 0.179;
  return (
    palette.enabled &&
    palette.mode !== 'original' &&
    originalIsDark !== (palette.mode === 'dark')
  );
};

export const getPersonalizationPalette = (palette: Palette): Palette => {
  if (!isCompanion(palette)) {
    return palette;
  }
  const dark = palette.mode === 'dark';
  const background = tone(palette.background, dark ? 0.009 : 0.91);
  const surface = tone(palette.surface, dark ? 0.018 : 0.98);
  const foreground = tone(palette.foreground, dark ? 0.88 : 0.018);
  const muted = tone(palette.muted, dark ? 0.42 : 0.15);
  const border = tone(palette.border, dark ? 0.1 : 0.55);
  const surfaceLuminance = dark
    ? Math.max(colorLuminance(background), colorLuminance(surface))
    : Math.min(colorLuminance(background), colorLuminance(surface));
  const targetAccent = dark
    ? 4.6 * (surfaceLuminance + 0.05) - 0.05
    : (surfaceLuminance + 0.05) / 4.6 - 0.05;
  const accent =
    Math.min(
      colorContrast(palette.accent, background),
      colorContrast(palette.accent, surface),
    ) >= 4.5
      ? palette.accent
      : tone(palette.accent, targetAccent);
  const accentForeground =
    colorContrast(palette.accentForeground, accent) >= 4.5
      ? palette.accentForeground
      : colorContrast('#ffffff', accent) >= colorContrast('#000000', accent)
        ? '#ffffff'
        : '#000000';
  return {
    ...palette,
    background,
    surface,
    foreground,
    muted,
    border,
    accent,
    accentForeground,
  };
};

export const getPersonalizationGradientEnd = (
  settings: Pick<PersonalizationSettings, 'palette' | 'background'>,
): string =>
  isCompanion(settings.palette)
    ? tone(
        settings.background.gradientEnd,
        settings.palette.mode === 'dark' ? 0.035 : 0.8,
      )
    : settings.background.gradientEnd;
