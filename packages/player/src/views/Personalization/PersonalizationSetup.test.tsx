import { cleanup } from '@testing-library/react';

import { SetupWrapper as Setup } from './PersonalizationSetup.test-wrapper';

describe('First launch personalization', () => {
  beforeEach(() => Setup.reset());
  afterEach(async () => {
    vi.restoreAllMocks();
    await Setup.flush();
    cleanup();
  });

  it('welcomes the user without a product identity and can use neutral defaults', async () => {
    Setup.mount();
    expect(Setup.dialog).toBeVisible();
    expect(Setup.heading).toBeVisible();
    await Setup.click('Use the defaults');
    expect(Setup.completed).toBe(true);
    expect(Setup.settings.identity).toEqual({
      displayName: '',
      logoDataUrl: '',
    });
    await Setup.rehydrate();
    expect(Setup.completed).toBe(true);
  });

  it('guides the user through a style, optional identity, fonts, layout, and sound', async () => {
    Setup.mount();
    await Setup.click('Continue');
    await Setup.click('Ocean');
    await Setup.click('Continue');
    await Setup.name('Night desk');
    await Setup.click('Continue');
    await Setup.select('Font style', 'mono');
    await Setup.select('Layout density', 'compact');
    await Setup.toggle('Enable interface sounds');
    await Setup.click('Start listening');
    expect(Setup.completed).toBe(true);
    expect(Setup.settings.palette.accent).toBe('#67d9d0');
    expect(Setup.settings.identity.displayName).toBe('Night desk');
    expect(Setup.settings.typography.bodyFont).toBe('mono');
    expect(Setup.settings.layout.density).toBe('compact');
    expect(Setup.settings.sounds.enabled).toBe(true);
  });

  it('can reopen setup while retaining the chosen preferences', async () => {
    Setup.mount();
    await Setup.click('Continue');
    await Setup.click('Linen');
    await Setup.click('Continue');
    await Setup.click('Continue');
    await Setup.click('Start listening');
    Setup.restart();
    expect(Setup.heading).toBeVisible();
    expect(Setup.settings.palette.background).toBe('#f4f0e8');
  });

  it('keeps setup open if preferences cannot be saved and retries after storage recovers', async () => {
    Setup.mount();
    Setup.failSaving();
    await Setup.click('Use the defaults');
    expect(await Setup.error).toHaveTextContent(
      'Your changes could not be saved',
    );
    expect(Setup.completed).toBe(false);
    expect(Setup.dialog).toBeVisible();
    Setup.restoreSaving();
    await Setup.click('Use the defaults');
    expect(Setup.completed).toBe(true);
  });
});
