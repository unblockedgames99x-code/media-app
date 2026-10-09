import { useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';

import { subscribeToVideoDeepLinks } from '../services/videoDeepLinks';
import { useVideoLinkStore } from '../stores/videoLinkStore';

export const useVideoDeepLinks = () => {
  const router = useRouter();
  useEffect(
    () =>
      subscribeToVideoDeepLinks((path) => {
        useVideoLinkStore.getState().request(path);
        void router.navigate({ to: '/videos' });
      }),
    [router],
  );
};
