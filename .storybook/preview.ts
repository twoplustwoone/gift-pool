import type { Preview } from '@storybook/react-vite';
import '../app/styles/nunito-font.css';
import '../app/styles/tailwind.css';

const preview: Preview = {
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
