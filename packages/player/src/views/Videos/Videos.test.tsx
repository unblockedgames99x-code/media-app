import { cleanup } from '@testing-library/react';

import { VideosWrapper } from './Videos.test-wrapper';

describe('Videos workspace', () => {
  beforeEach(() => VideosWrapper.reset());
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('opens the complete video workspace and pauses music without losing its position', async () => {
    VideosWrapper.mount();
    expect(VideosWrapper.workspace).toBeInTheDocument();
    expect(VideosWrapper.musicStatus).toBe('paused');
    expect(VideosWrapper.musicPosition).toBe(27);
    await VideosWrapper.attached();
    await VideosWrapper.ready();
  });

  it('shows progress while the video engine is starting', async () => {
    const finishStartup = VideosWrapper.deferStartup();
    VideosWrapper.mount();
    await VideosWrapper.attached();
    expect(VideosWrapper.status).toHaveTextContent('Opening videos');
    await finishStartup();
    await VideosWrapper.ready();
  });

  it('keeps the video engine hidden until first launch setup is complete', async () => {
    VideosWrapper.startSetup();
    VideosWrapper.mount();
    expect(VideosWrapper.attachCount).toBe(0);
    VideosWrapper.finishSetup();
    await VideosWrapper.attached();
    await VideosWrapper.ready();
  });

  it('opens an external video after startup and opens new links while already watching', async () => {
    const finishStartup = VideosWrapper.deferStartup();
    VideosWrapper.openVideoLink('/watch/dQw4w9WgXcQ');
    VideosWrapper.mount();
    await VideosWrapper.attached();
    expect(VideosWrapper.navigationCount).toBe(0);
    await finishStartup();
    await VideosWrapper.videoLinkOpened('/watch/dQw4w9WgXcQ');
    VideosWrapper.openVideoLink('/watch/aB_cD-01234');
    await VideosWrapper.videoLinkOpened('/watch/aB_cD-01234');
    VideosWrapper.openVideoLink('/watch/aB_cD-01234');
    await VideosWrapper.videoLinkOpened('/watch/aB_cD-01234');
    expect(VideosWrapper.navigationCount).toBe(3);
  });

  it('keeps a requested external video available after a failed startup', async () => {
    VideosWrapper.openVideoLink('/watch/dQw4w9WgXcQ');
    VideosWrapper.failStartup();
    VideosWrapper.mount();
    await VideosWrapper.attached();
    expect(VideosWrapper.navigationCount).toBe(0);
    VideosWrapper.restoreStartup();
    await VideosWrapper.retry.click();
    await VideosWrapper.videoLinkOpened('/watch/dQw4w9WgXcQ');
  });

  it('keeps music paused when a delayed music stream resolves while Videos is open', async () => {
    const view = VideosWrapper.mount();
    await VideosWrapper.ready();
    VideosWrapper.startMusicAfterOpeningVideos();
    expect(VideosWrapper.musicStatus).toBe('paused');
    expect(VideosWrapper.musicPosition).toBe(27);
    view.unmount();
    VideosWrapper.startMusicAfterOpeningVideos();
    expect(VideosWrapper.musicStatus).toBe('playing');
    expect(VideosWrapper.musicPosition).toBe(27);
  });

  it('offers a working retry when the video engine cannot start', async () => {
    VideosWrapper.failStartup();
    VideosWrapper.mount();
    await VideosWrapper.attached();
    expect(VideosWrapper.error).toHaveTextContent('Videos could not open');
    VideosWrapper.restoreStartup();
    await VideosWrapper.retry.click();
    await VideosWrapper.ready();
  });

  it('keeps the video surface aligned when the window changes size', async () => {
    VideosWrapper.mount();
    await VideosWrapper.ready();
    await VideosWrapper.resize();
  });

  it('offers recovery if the video engine stops after it opened successfully', async () => {
    VideosWrapper.mount();
    await VideosWrapper.ready();
    await VideosWrapper.crashEngine();
    await VideosWrapper.retry.click();
    await VideosWrapper.ready();
  });

  it('makes music settings accessible above the native video surface', async () => {
    VideosWrapper.mount();
    await VideosWrapper.ready();
    await VideosWrapper.openSettings();
    VideosWrapper.closeSettings();
    await VideosWrapper.attached();
    await VideosWrapper.ready();
  });

  it('keeps remote control popovers usable above the native video surface', async () => {
    VideosWrapper.mount();
    await VideosWrapper.ready();
    await VideosWrapper.openRemoteControl();
    await VideosWrapper.closeRemoteControl();
    await VideosWrapper.ready();
  });

  it('hides videos on navigation, including when startup finishes after leaving', async () => {
    const finishStartup = VideosWrapper.deferStartup();
    const view = VideosWrapper.mount();
    await VideosWrapper.attached();
    view.unmount();
    await VideosWrapper.hidden();
    await finishStartup();
    expect(VideosWrapper.musicStatus).toBe('paused');
  });
});
