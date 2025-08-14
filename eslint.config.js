import { default as defaultConfig } from '@epic-web/config/eslint';
import react from 'eslint-plugin-react';

/** @type {import("eslint").Linter.Config} */
export default [
  ...defaultConfig,
  {
    plugins: { react },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // Force React components to be arrow functions
      'react/function-component-definition': [
        'error',
        {
          namedComponents: 'arrow-function',
          unnamedComponents: 'arrow-function',
        },
      ],
    },
  },
];
