import type { PersonalizationSettings } from '../stores/personalizationStore';

const fontFamilies = {
  system:
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  sans: '"DM Sans", system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"Space Mono", ui-monospace, Consolas, monospace',
};

export const getPersonalizationVariables = (
  settings: PersonalizationSettings,
) => {
  const { typography, palette, layout, sounds, audio } = settings;
  const bodyFont =
    typography.bodyFont === 'custom'
      ? typography.customBodyFont || fontFamilies.system
      : fontFamilies[typography.bodyFont];
  const headingFont =
    typography.headingFont === 'custom'
      ? typography.customHeadingFont || bodyFont
      : fontFamilies[typography.headingFont];
  const variables: Record<string, string> = {
    '--font-family': bodyFont,
    '--font-family-heading': headingFont,
    '--default-font-family': bodyFont,
    '--font-size-base': `${(typography.size * layout.uiScale) / 100}px`,
    '--font-weight-normal': String(typography.weight),
    '--line-height': String(typography.lineHeight),
    '--border-width': `${layout.borderWidth}px`,
    '--radius-sm': `${Math.max(0, layout.cornerRadius - 4)}px`,
    '--radius-md': `${layout.cornerRadius}px`,
    '--radius-lg': `${layout.cornerRadius + (layout.cornerRadius ? 4 : 0)}px`,
    '--shadow-x': `${layout.shadow}px`,
    '--shadow-y': `${layout.shadow}px`,
    '--density': layout.density,
    '--spacing':
      layout.density === 'compact'
        ? '0.21rem'
        : layout.density === 'spacious'
          ? '0.29rem'
          : '0.25rem',
    '--artwork-radius':
      layout.artworkShape === 'circle'
        ? '50%'
        : layout.artworkShape === 'square'
          ? '0px'
          : `${layout.cornerRadius}px`,
    '--artwork-saturation': `${layout.artworkSaturation}%`,
    '--artwork-visible': layout.showArtwork ? '1' : '0',
    '--motion-level':
      layout.motion === 'none' ? '0' : layout.motion === 'reduced' ? '1' : '2',
    '--tooltips-visible': layout.showTooltips ? '1' : '0',
    '--audio-enabled': audio.enabled ? '1' : '0',
    '--audio-bass': String(audio.bass),
    '--audio-mid': String(audio.mid),
    '--audio-treble': String(audio.treble),
    '--audio-balance': String(audio.balance),
    '--audio-mono': audio.mono ? '1' : '0',
    '--sounds-enabled': sounds.enabled ? '1' : '0',
    '--sounds-volume': String(sounds.volume),
    '--sounds-tone': sounds.tone,
    '--sounds-selection': sounds.selection ? '1' : '0',
    '--sounds-navigation': sounds.navigation ? '1' : '0',
    '--sounds-notification': sounds.notification ? '1' : '0',
  };
  if (palette.enabled) {
    Object.assign(variables, {
      '--background': palette.background,
      '--foreground': palette.foreground,
      '--muted': palette.surface,
      '--muted-foreground': palette.muted,
      '--card': palette.surface,
      '--card-foreground': palette.foreground,
      '--popover': palette.surface,
      '--popover-foreground': palette.foreground,
      '--input': palette.background,
      '--input-foreground': palette.foreground,
      '--primary': palette.accent,
      '--primary-foreground': palette.accentForeground,
      '--border': palette.border,
      '--ring': palette.accent,
      '--topbar': palette.background,
      '--topbar-foreground': palette.foreground,
      '--bottombar': palette.surface,
      '--bottombar-foreground': palette.foreground,
      '--sidebar-left': palette.surface,
      '--sidebar-left-foreground': palette.foreground,
      '--sidebar-right': palette.surface,
      '--sidebar-right-foreground': palette.foreground,
    });
    for (const surface of [
      'background',
      'muted',
      'card',
      'popover',
      'input',
      'primary',
      'topbar',
      'bottombar',
      'sidebar-left',
      'sidebar-right',
    ]) {
      variables[`--${surface}-gradient`] = 'none';
    }
  }
  return variables;
};
