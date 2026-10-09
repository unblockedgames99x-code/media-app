import { invoke } from '@tauri-apps/api/core';
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';

export const parseVideoDeepLink = (url: string): string | null => {
  const match = /^cartermedia:\/\/watch\/([A-Za-z0-9_-]{11})\/?$/i.exec(url);
  return match ? `/watch/${match[1]}` : null;
};

export const subscribeToVideoDeepLinks = (
  openVideo: (path: string) => void,
): (() => void) => {
  let disposed = false;
  let receivedNewLink = false;
  let unlisten: (() => void) | undefined;
  const openLinks = (urls: string[] | null) => {
    if (disposed || !Array.isArray(urls)) {
      return;
    }
    const paths = urls
      .filter((url) => typeof url === 'string')
      .map(parseVideoDeepLink)
      .filter((path): path is string => path !== null);
    const path = paths.at(-1);
    if (path) {
      openVideo(path);
    }
  };
  void onOpenUrl((urls) => {
    receivedNewLink = true;
    openLinks(urls);
  })
    .then(async (stopListening) => {
      if (disposed) {
        stopListening();
        return;
      }
      unlisten = stopListening;
      const urls = await getCurrent();
      if (!receivedNewLink) {
        if (urls?.some((url) => parseVideoDeepLink(url) !== null)) {
          openLinks(urls);
        } else {
          const startupLink = await invoke<string | null>('startup_video_link');
          if (!receivedNewLink) {
            openLinks(startupLink ? [startupLink] : null);
          }
        }
      }
    })
    .catch(() => {});
  return () => {
    disposed = true;
    unlisten?.();
  };
};
