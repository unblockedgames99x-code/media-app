import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { usePersonalizationStore } from '../stores/personalizationStore';
import { SourcesWrapper } from '../views/Sources/Sources.test-wrapper';

export const DefaultSourcesWrapper = {
  async mount() {
    usePersonalizationStore.setState({ setupCompleted: true });
    return SourcesWrapper.mount();
  },
  section: SourcesWrapper.section,
  get status() {
    return screen.getByTestId('default-sources-status');
  },
  retry: {
    async click() {
      await userEvent.click(
        within(DefaultSourcesWrapper.status).getByRole('button', {
          name: 'Retry',
        }),
      );
    },
  },
};
