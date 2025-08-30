import { default as defaultConfig } from '@epic-web/config/eslint';
import filenames from 'eslint-plugin-filenames';
import react from 'eslint-plugin-react';
import unicorn from 'eslint-plugin-unicorn';

/** @type {import("eslint").Linter.Config} */
export default [
  ...defaultConfig,

  {
    plugins: { react, unicorn, filenames },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // Keep your existing rule
      'react/function-component-definition': [
        'error',
        {
          namedComponents: 'arrow-function',
          unnamedComponents: 'arrow-function',
        },
      ],
    },
  },

  // Default: enforce kebab-case unless overridden
  {
    rules: {
      'unicorn/filename-case': ['error', { case: 'kebabCase' }],
      'filenames/match-exported': ['error', ['kebab', 'PascalCase', 'camel']],
    },
  },

  // Hooks → camelCase, start with "use"
  {
    files: ['**/use*.{ts,tsx}'],
    rules: {
      'unicorn/filename-case': ['error', { case: 'camelCase' }],
      'filenames/match-exported': 'off',
    },
  },

  // Components → PascalCase
  {
    files: ['app/components/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
    rules: {
      'unicorn/filename-case': ['error', { case: 'pascalCase' }],
      'filenames/match-exported': ['error', ['PascalCase']],
    },
  },

  // Context / providers (PascalCase if they export a component)
  {
    files: ['app/context/**/*.{ts,tsx}', 'src/context/**/*.{ts,tsx}'],
    rules: {
      'unicorn/filename-case': ['error', { case: 'pascalCase' }],
      'filenames/match-exported': ['error', ['PascalCase']],
    },
  },

  // Utilities/helpers → kebab-case
  {
    files: [
      'app/utils/**/*.{ts,tsx}',
      'src/utils/**/*.{ts,tsx}',
      'app/lib/**/*.{ts,tsx}',
      'src/lib/**/*.{ts,tsx}',
    ],
    rules: {
      'unicorn/filename-case': ['error', { case: 'kebabCase' }],
      'filenames/match-exported': 'off',
    },
  },

  // Remix routes & configs → allow special names
  {
    files: [
      'app/routes/**/*.{ts,tsx}',
      'eslint.config.{js,ts}',
      'tailwind.config.{js,ts}',
      'postcss.config.{js,ts}',
      'vite.config.{js,ts}',
      'vitest.config.{js,ts}',
      'tsconfig*.json',
      '**/*.d.ts',
      'prisma/**/*.*',
      'scripts/**/*.*',
    ],
    rules: {
      'unicorn/filename-case': 'off',
      'filenames/match-exported': 'off',
    },
  },
];
