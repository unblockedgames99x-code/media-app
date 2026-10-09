import { cleanup } from '@testing-library/react';

import { PersonalizationWrapper as Personalization } from './Personalization.test-wrapper';

describe('Personalization', () => {
  beforeEach(() => Personalization.reset());
  afterEach(() => cleanup());

  it('starts with a nameless, logo-free preview and lets the user choose a complete style', async () => {
    Personalization.mount();
    expect(Personalization.heading).toBeVisible();
    expect(Personalization.preview).toBeVisible();
    expect(Personalization.settings.identity).toEqual({
      displayName: '',
      logoDataUrl: '',
    });
    await Personalization.click('Ocean');
    expect(Personalization.settings.palette.accent).toBe('#67d9d0');
    expect(Personalization.preview).toHaveAttribute(
      'data-preset-preview',
      'custom',
    );
  });

  it('applies a custom color and preserves it across a reload', async () => {
    Personalization.mount();
    await Personalization.text('Accent hex', '#ff8800');
    expect(Personalization.settings.palette.accent).toBe('#ff8800');
    await Personalization.rehydrate();
    expect(Personalization.settings.palette.accent).toBe('#ff8800');
  });

  it('keeps a valid color when an incomplete color is entered', async () => {
    Personalization.mount();
    await Personalization.text('Accent hex', 'invalid');
    expect(Personalization.settings.palette.accent).toBe('#a8b4ff');
  });

  it('saves the final preference once after many rapid adjustments', async () => {
    Personalization.mount();
    expect(await Personalization.rapidlyResizeSidebar()).toBe(1);
    expect(Personalization.settings.layout.sidebarWidth).toBe(260);
    await Personalization.rehydrate();
    expect(Personalization.settings.layout.sidebarWidth).toBe(260);
  });

  it('stores an installed custom font and layout choices', async () => {
    Personalization.mount();
    await Personalization.tab('Typography');
    await Personalization.select('Body font', 'custom');
    await Personalization.text('Installed body font', 'Arial');
    expect(Personalization.settings.typography.customBodyFont).toBe('Arial');
    await Personalization.tab('Layout');
    await Personalization.select('Density', 'compact');
    await Personalization.select('Artwork shape', 'circle');
    await Personalization.toggle('Collapse the sidebar');
    expect(Personalization.settings.layout).toMatchObject({
      density: 'compact',
      artworkShape: 'circle',
      sidebarCollapsed: true,
    });
  });

  it('uses optional user identity without reintroducing a product name', async () => {
    Personalization.mount();
    await Personalization.tab('Identity');
    await Personalization.text('Your app name', 'Evening room');
    expect(Personalization.preview).toHaveTextContent('Evening room');
    await Personalization.click('Clear name');
    expect(Personalization.settings.identity.displayName).toBe('');
  });

  it('lets users enable sounds and adjust real audio preferences', async () => {
    Personalization.mount();
    await Personalization.tab('Sound');
    await Personalization.toggle('Interface sounds');
    await Personalization.select('Sound character', 'digital');
    await Personalization.toggle('Enable music equalizer');
    await Personalization.toggle('Mono music playback');
    expect(Personalization.settings.sounds).toMatchObject({
      enabled: true,
      tone: 'digital',
    });
    expect(Personalization.settings.audio).toMatchObject({
      enabled: true,
      mono: true,
    });
  });

  it('exports, resets, and restores the complete personalization profile', async () => {
    Personalization.mount();
    await Personalization.click('Linen');
    await Personalization.tab('Profiles');
    await Personalization.click('Export to text');
    const profile = Personalization.profileJson;
    expect(JSON.parse(profile).version).toBe(1);
    await Personalization.click('Reset personalization');
    expect(Personalization.settings.palette.background).toBe('#171719');
    await Personalization.setProfileJson(profile);
    await Personalization.click('Import from text');
    expect(Personalization.settings.palette.background).toBe('#f4f0e8');
    expect(Personalization.notice).toHaveTextContent('Profile imported');
  });

  it('rejects invalid profiles without changing the current preferences', async () => {
    Personalization.mount();
    await Personalization.tab('Profiles');
    await Personalization.setProfileJson(
      '{"version":1,"settings":{"typography":{"size":900}}}',
    );
    await Personalization.click('Import from text');
    expect(Personalization.error).toHaveTextContent('The profile is invalid');
    expect(Personalization.settings.typography.size).toBe(16);
  });
});
