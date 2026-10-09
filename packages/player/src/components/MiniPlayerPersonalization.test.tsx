import { cleanup, waitFor } from '@testing-library/react';

import { MiniPlayerPersonalizationWrapper as wrapper } from './MiniPlayerPersonalization.test-wrapper';

describe('Mini player personalization', () => {
  beforeEach(() => wrapper.reset());
  afterEach(cleanup);

  it('uses the chosen identity on an already open plugin without replacing its controls', async () => {
    const onPlay = vi.fn();
    wrapper.addPlugin(onPlay);
    const originalButton = wrapper.play;
    const originalSeek = wrapper.seek;
    wrapper.identity('My listening room', 'data:image/png;base64,AAAA');
    wrapper.mount();
    await waitFor(() =>
      expect(wrapper.brand).toHaveTextContent('My listening room'),
    );
    expect(wrapper.logo).toHaveAttribute('src', 'data:image/png;base64,AAAA');
    expect(wrapper.play).toBe(originalButton);
    expect(wrapper.seek).toBe(originalSeek);
    expect(wrapper.seek).toHaveValue('40');
    expect(wrapper.lyrics).toHaveStyle({ fontSize: '24px' });
    await wrapper.clickPlay();
    expect(onPlay).toHaveBeenCalledOnce();
  });

  it('personalizes a plugin opened later and updates identity safely while it stays open', async () => {
    wrapper.mount();
    wrapper.addPlugin();
    await waitFor(() => expect(wrapper.brand).toBeEmptyDOMElement());
    expect(wrapper.panel).toHaveAttribute('data-media-mini-player', 'true');
    wrapper.identity('<img src=x onerror=alert(1)>');
    await waitFor(() =>
      expect(wrapper.brand).toHaveTextContent('<img src=x onerror=alert(1)>'),
    );
    expect(wrapper.brand.children).toHaveLength(0);
    wrapper.identity('Evening', 'data:image/webp;base64,AAAA');
    await waitFor(() => expect(wrapper.brand).toHaveTextContent('Evening'));
    expect(wrapper.logo).toHaveAttribute('src', 'data:image/webp;base64,AAAA');
    wrapper.identity('');
    await waitFor(() => expect(wrapper.brand).toBeEmptyDOMElement());
  });

  it('keeps live app token styling enabled unless the plugin theme sync is explicitly disabled', async () => {
    wrapper.addPlugin();
    wrapper.mount();
    expect(wrapper.panel).toHaveAttribute('data-media-theme-sync', 'true');
    wrapper.themeSync(false);
    expect(wrapper.panel).toHaveAttribute('data-media-theme-sync', 'false');
    wrapper.identity('Personal library');
    expect(wrapper.brand).toHaveTextContent('Personal library');
    wrapper.themeSync(true);
    expect(wrapper.panel).toHaveAttribute('data-media-theme-sync', 'true');
  });

  it('handles a panel recreated by plugin updates without replacing the new controls', async () => {
    wrapper.identity('Late night');
    const firstPlugin = wrapper.addPlugin();
    wrapper.mount();
    await waitFor(() => expect(wrapper.brand).toHaveTextContent('Late night'));
    firstPlugin.unmount();
    const onPlay = vi.fn();
    wrapper.addPlugin(onPlay);
    const newButton = wrapper.play;
    await waitFor(() => expect(wrapper.brand).toHaveTextContent('Late night'));
    expect(wrapper.play).toBe(newButton);
    await wrapper.clickPlay();
    expect(onPlay).toHaveBeenCalledOnce();
  });

  it('disconnects on unmount and restores plugin-owned identity without changing playback DOM', async () => {
    wrapper.addPlugin();
    const originalButton = wrapper.play;
    const controller = wrapper.mount();
    await waitFor(() => expect(wrapper.brand).toBeEmptyDOMElement());
    controller.unmount();
    expect(wrapper.brand).toHaveTextContent('nuclear | player');
    expect(wrapper.panel).not.toHaveAttribute('data-media-mini-player');
    expect(wrapper.panel).not.toHaveAttribute('data-media-theme-sync');
    expect(wrapper.play).toBe(originalButton);
    wrapper.identity('Should stay disconnected');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(wrapper.brand).toHaveTextContent('nuclear | player');
  });
});
