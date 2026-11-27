import type { Decorator, Preview } from '@storybook/react-vite';
import { createRoutesStub } from 'react-router';
import '../app/styles/fonts.css';
import '../app/styles/tailwind.css';

const withDataRouter: Decorator = (Story, { parameters }) => {
  const Stub = createRoutesStub([{ path: '*', Component: () => <Story /> }]);
  return <Stub initialEntries={parameters.initialEntries ?? ['/']} />;
};

const preview: Preview = {
  decorators: [withDataRouter],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
