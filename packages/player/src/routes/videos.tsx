import { createFileRoute } from '@tanstack/react-router';

import { Videos } from '../views/Videos';

export const Route = createFileRoute('/videos')({
  component: Videos,
});
