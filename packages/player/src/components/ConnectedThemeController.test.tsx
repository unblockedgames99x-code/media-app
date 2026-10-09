import { ThemeControllerWrapper as Theme } from './ConnectedThemeController.test-wrapper';

describe('Theme switching with personalization', () => {
  it('keeps custom colors when the current light/dark preference is restored', async () => {
    await Theme.mount();
    expect(Theme.customPalette.enabled).toBe(true);
  });

  it('lets an explicit light/dark choice take over without losing the saved colors', async () => {
    await Theme.mount();
    const accent = Theme.customPalette.accent;
    await Theme.toggle();
    expect(Theme.isDark).toBe(true);
    expect(Theme.customPalette.enabled).toBe(false);
    expect(Theme.customPalette.accent).toBe(accent);
  });
});
