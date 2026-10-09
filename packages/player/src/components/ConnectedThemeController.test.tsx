import { cleanup } from '@testing-library/react';

import { ThemeControllerWrapper as Theme } from './ConnectedThemeController.test-wrapper';

describe('Theme switching with personalization', () => {
  afterEach(() => cleanup());

  it.each([
    ['Neutral', true],
    ['Linen', false],
    ['Ocean', true],
    ['Terminal', true],
  ] as const)(
    'switches %s between light and dark and restores the exact chosen colors',
    async (preset, dark) => {
      await Theme.mount();
      await Theme.preset(preset);
      const originalPalette = { ...Theme.customPalette };
      const originalBackground =
        Theme.variables.getPropertyValue('--background');
      expect(Theme.element).toHaveAttribute('aria-checked', String(dark));
      await Theme.toggle();
      expect(Theme.element).toHaveAttribute('aria-checked', String(!dark));
      expect(Theme.customPalette.enabled).toBe(true);
      expect(Theme.variables.getPropertyValue('--background')).not.toBe(
        originalBackground,
      );
      expect(Theme.preview).not.toHaveStyle({
        backgroundColor: originalPalette.background,
      });
      expect(Theme.customPalette.accent).toBe(originalPalette.accent);
      await Theme.toggle();
      expect(Theme.variables.getPropertyValue('--background')).toBe(
        originalBackground,
      );
      expect(Theme.preview).toHaveStyle({
        backgroundColor: originalPalette.background,
      });
    },
  );

  it('retains fonts, layout and sounds while switching brightness', async () => {
    await Theme.mount();
    await Theme.preset('Ocean');
    await Theme.customize();
    const preferences = structuredClone(Theme.settings);
    await Theme.toggle();
    expect(Theme.settings.typography).toEqual(preferences.typography);
    expect(Theme.settings.layout).toEqual(preferences.layout);
    expect(Theme.settings.sounds).toEqual(preferences.sounds);
  });

  it('restores the selected companion mode when the saved profile reloads', async () => {
    await Theme.mount();
    await Theme.preset('Ocean');
    await Theme.toggle();
    const lightBackground = Theme.variables.getPropertyValue('--background');
    await Theme.rehydrate();
    expect(Theme.element).toHaveAttribute('aria-checked', 'false');
    expect(Theme.variables.getPropertyValue('--background')).toBe(
      lightBackground,
    );
    await Theme.toggle();
    expect(Theme.preview).toHaveStyle({ backgroundColor: '#101c26' });
  });

  it('edits the colors currently visible without replacing the rest of the companion palette', async () => {
    await Theme.mount();
    await Theme.preset('Ocean');
    await Theme.toggle();
    const lightBackground = Theme.variables.getPropertyValue('--background');
    await Theme.editAccent('#8a542f');
    expect(Theme.variables.getPropertyValue('--primary')).toBe('#8a542f');
    expect(Theme.variables.getPropertyValue('--background')).toBe(
      lightBackground,
    );
    expect(Theme.element).toHaveAttribute('aria-checked', 'false');
    await Theme.toggle();
    await Theme.toggle();
    expect(Theme.variables.getPropertyValue('--primary')).toBe('#8a542f');
  });

  it('accepts existing profiles without a brightness preference and reflects their actual colors', async () => {
    await Theme.mount();
    await Theme.preset('Linen');
    Theme.importLegacyProfile();
    expect(Theme.element).toHaveAttribute('aria-checked', 'false');
    expect(Theme.preview).toHaveStyle({ backgroundColor: '#f4f0e8' });
    await Theme.toggle();
    expect(Theme.element).toHaveAttribute('aria-checked', 'true');
  });

  it('keeps original themes switchable when custom colors are disabled', async () => {
    await Theme.mount();
    await Theme.useOriginalTheme();
    const originalPalette = { ...Theme.customPalette };
    const dark = Theme.isDark;
    await Theme.toggle();
    expect(Theme.isDark).toBe(!dark);
    expect(Theme.customPalette).toEqual(originalPalette);
  });
});
