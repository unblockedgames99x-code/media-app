import {
  defaultPersonalization,
  personalizationPresets,
  personalizationSchema,
} from '../stores/personalizationStore';
import {
  colorContrast,
  colorLuminance,
  getPersonalizationGradientEnd,
  getPersonalizationPalette,
} from './personalizationPalette';

describe('Personalization companion colors', () => {
  it.each(personalizationPresets)(
    'keeps $id text, accents and button labels readable in the opposite mode',
    (preset) => {
      const settings = personalizationSchema.parse({
        ...defaultPersonalization,
        palette: preset.palette,
      });
      settings.palette.mode =
        colorLuminance(settings.palette.background) < 0.179 ? 'light' : 'dark';
      const palette = getPersonalizationPalette(settings.palette);
      for (const surface of [palette.background, palette.surface]) {
        expect(
          colorContrast(palette.foreground, surface),
        ).toBeGreaterThanOrEqual(4.5);
        expect(colorContrast(palette.muted, surface)).toBeGreaterThanOrEqual(
          4.5,
        );
        expect(colorContrast(palette.accent, surface)).toBeGreaterThanOrEqual(
          4.5,
        );
      }
      expect(
        colorContrast(palette.accentForeground, palette.accent),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('adapts both gradient stops and restores the original gradient when switching back', () => {
    const settings = structuredClone(defaultPersonalization);
    settings.background.style = 'gradient';
    settings.palette.mode = 'light';
    expect(
      colorLuminance(getPersonalizationGradientEnd(settings)),
    ).toBeGreaterThan(0.75);
    settings.palette.mode = 'dark';
    expect(getPersonalizationGradientEnd(settings)).toBe(
      defaultPersonalization.background.gradientEnd,
    );
  });
});
