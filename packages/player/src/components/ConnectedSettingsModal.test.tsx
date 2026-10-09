import { registerBuiltInCoreSettings } from '../services/coreSettings';
import { useSettingsModalStore } from '../stores/settingsModalStore';
import { resetInMemoryTauriStore } from '../test/utils/inMemoryTauriStore';
import { ConnectedSettingsModalWrapper } from './ConnectedSettingsModal.test-wrapper';

describe('ConnectedSettingsModal', () => {
  beforeEach(() => {
    resetInMemoryTauriStore();
    registerBuiltInCoreSettings();
    useSettingsModalStore.setState({
      isOpen: false,
      activeItemId: null,
    });
  });

  it('lists one section per settings category under Settings and the app views under App', async () => {
    await ConnectedSettingsModalWrapper.mount();

    expect(ConnectedSettingsModalWrapper.generalSection).toHaveTextContent(
      'Settings',
    );
    expect(ConnectedSettingsModalWrapper.appSection).toHaveTextContent('App');
    expect(ConnectedSettingsModalWrapper.categoryLabels).toEqual([
      'Appearance',
      'General',
      'History',
      'Integrations',
      'Playback',
      'Plugins',
      'Updates',
    ]);
    expect(
      ConnectedSettingsModalWrapper.appTab('shortcuts').element,
    ).toHaveTextContent('Key Shortcuts');
    expect(
      ConnectedSettingsModalWrapper.appTab('themes').element,
    ).toHaveTextContent('Themes');
  });

  it('shows the general view with its sections when opened', async () => {
    await ConnectedSettingsModalWrapper.mount();

    expect(
      await ConnectedSettingsModalWrapper.viewTitle('General'),
    ).toBeInTheDocument();
    expect(
      ConnectedSettingsModalWrapper.section('appearance'),
    ).toBeInTheDocument();
  });

  it('keeps navigation free of promotional links and version text while preserving source attribution', async () => {
    await ConnectedSettingsModalWrapper.mount();

    expect(ConnectedSettingsModalWrapper.navigationButtonCount).toBe(13);
    expect(ConnectedSettingsModalWrapper.navigation).not.toHaveTextContent(
      /Discord|GitHub|Mastodon|Website|v\d+\.\d+\.\d+/,
    );

    await ConnectedSettingsModalWrapper.appTab('whats-new').click();
    expect(ConnectedSettingsModalWrapper.sourceAttribution).toHaveTextContent(
      'Nuclear',
    );
    expect(ConnectedSettingsModalWrapper.sourceAttribution).toHaveTextContent(
      'FreeTube',
    );
    expect(ConnectedSettingsModalWrapper.sourceAttribution).toHaveTextContent(
      'AGPL-3.0',
    );
  });

  it('selecting an App tab shows that view', async () => {
    await ConnectedSettingsModalWrapper.mount();

    await ConnectedSettingsModalWrapper.appTab('themes').click();

    expect(
      await ConnectedSettingsModalWrapper.viewTitle('Themes'),
    ).toBeInTheDocument();
  });

  it('opens the full personalization view from Preferences', async () => {
    await ConnectedSettingsModalWrapper.mount();
    await ConnectedSettingsModalWrapper.appTab('personalization').click();
    expect(
      await ConnectedSettingsModalWrapper.viewTitle('Make it yours'),
    ).toBeVisible();
  });

  it('selecting a category after an App tab returns to the general view with that section', async () => {
    await ConnectedSettingsModalWrapper.mount();

    await ConnectedSettingsModalWrapper.appTab('app-plugins').click();
    await ConnectedSettingsModalWrapper.category('plugins').click();

    expect(
      await ConnectedSettingsModalWrapper.viewTitle('General'),
    ).toBeInTheDocument();
    expect(
      ConnectedSettingsModalWrapper.section('plugins'),
    ).toBeInTheDocument();
  });
});
