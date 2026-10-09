import { invoke } from '@tauri-apps/api/core';
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';

import {
  parseVideoDeepLink,
  subscribeToVideoDeepLinks,
} from './videoDeepLinks';

vi.mock('@tauri-apps/plugin-deep-link', () => ({
  getCurrent: vi.fn(),
  onOpenUrl: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

describe('CarterMedia video links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockResolvedValue(null);
  });

  it('accepts CarterMedia watch links with a complete video identifier', () => {
    expect(parseVideoDeepLink('cartermedia://watch/dQw4w9WgXcQ')).toBe(
      '/watch/dQw4w9WgXcQ',
    );
    expect(parseVideoDeepLink('CarterMedia://watch/aB_cD-01234/')).toBe(
      '/watch/aB_cD-01234',
    );
  });

  it.each([
    'freetube://watch/dQw4w9WgXcQ',
    'cartertube://watch/dQw4w9WgXcQ',
    'https://watch/dQw4w9WgXcQ',
    'cartermedia://watch/short',
    'cartermedia://watch/dQw4w9WgXcQ?redirect=https://example.com',
    'cartermedia://watch/dQw4w9WgXcQ#details',
    'cartermedia://user@watch/dQw4w9WgXcQ',
    'cartermedia://watch/dQw4w9WgXcQ/extra',
    'cartermedia://settings',
    'cartermedia://watch/%64Qw4w9WgXcQ',
  ])('ignores unsupported or malformed links: %s', (url) => {
    expect(parseVideoDeepLink(url)).toBeNull();
  });

  it('opens the last valid video from the initial launch', async () => {
    vi.mocked(onOpenUrl).mockResolvedValue(() => {});
    vi.mocked(getCurrent).mockResolvedValue([
      'cartermedia://watch/dQw4w9WgXcQ',
      'cartermedia://watch/aB_cD-01234',
      'https://example.com',
    ]);
    const openVideo = vi.fn();
    const dispose = subscribeToVideoDeepLinks(openVideo);
    await vi.waitFor(() =>
      expect(openVideo).toHaveBeenCalledWith('/watch/aB_cD-01234'),
    );
    dispose();
  });

  it('receives links in the running app and removes its listener on exit', async () => {
    const unlisten = vi.fn();
    vi.mocked(onOpenUrl).mockResolvedValue(unlisten);
    vi.mocked(getCurrent).mockResolvedValue(null);
    const openVideo = vi.fn();
    const dispose = subscribeToVideoDeepLinks(openVideo);
    await vi.waitFor(() => expect(getCurrent).toHaveBeenCalled());
    vi.mocked(onOpenUrl).mock.calls[0][0](['cartermedia://watch/dQw4w9WgXcQ']);
    expect(openVideo).toHaveBeenCalledWith('/watch/dQw4w9WgXcQ');
    dispose();
    expect(unlisten).toHaveBeenCalledOnce();
    vi.mocked(onOpenUrl).mock.calls[0][0](['cartermedia://watch/aB_cD-01234']);
    expect(openVideo).toHaveBeenCalledOnce();
  });

  it('opens a startup CLI video when the operating system has no initial URL', async () => {
    vi.mocked(onOpenUrl).mockResolvedValue(() => {});
    vi.mocked(getCurrent).mockResolvedValue(null);
    vi.mocked(invoke).mockResolvedValue('cartermedia://watch/dQw4w9WgXcQ');
    const openVideo = vi.fn();
    const dispose = subscribeToVideoDeepLinks(openVideo);
    await vi.waitFor(() =>
      expect(openVideo).toHaveBeenCalledWith('/watch/dQw4w9WgXcQ'),
    );
    dispose();
  });

  it('keeps a new operating-system link while a CLI fallback is still loading', async () => {
    vi.mocked(onOpenUrl).mockResolvedValue(() => {});
    vi.mocked(getCurrent).mockResolvedValue(null);
    let finishStartup!: (url: string) => void;
    vi.mocked(invoke).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishStartup = resolve;
        }),
    );
    const openVideo = vi.fn();
    const dispose = subscribeToVideoDeepLinks(openVideo);
    await vi.waitFor(() => expect(invoke).toHaveBeenCalled());
    vi.mocked(onOpenUrl).mock.calls[0][0](['cartermedia://watch/aB_cD-01234']);
    finishStartup('cartermedia://watch/dQw4w9WgXcQ');
    await Promise.resolve();
    expect(openVideo).toHaveBeenCalledExactlyOnceWith('/watch/aB_cD-01234');
    dispose();
  });

  it('keeps a newly received video instead of replaying an older startup link', async () => {
    vi.mocked(onOpenUrl).mockResolvedValue(() => {});
    let finishCurrent!: (urls: string[]) => void;
    vi.mocked(getCurrent).mockImplementation(
      () => new Promise((resolve) => (finishCurrent = resolve)),
    );
    const openVideo = vi.fn();
    const dispose = subscribeToVideoDeepLinks(openVideo);
    await vi.waitFor(() => expect(getCurrent).toHaveBeenCalled());
    vi.mocked(onOpenUrl).mock.calls[0][0](['cartermedia://watch/aB_cD-01234']);
    finishCurrent(['cartermedia://watch/dQw4w9WgXcQ']);
    await Promise.resolve();
    expect(openVideo).toHaveBeenCalledExactlyOnceWith('/watch/aB_cD-01234');
    dispose();
  });
});
