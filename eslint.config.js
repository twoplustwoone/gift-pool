import { default as defaultConfig } from '@epic-web/config/eslint';
import filenames from 'eslint-plugin-filenames';
import react from 'eslint-plugin-react';
import unicorn from 'eslint-plugin-unicorn';

/** @type {import("eslint").Linter.Config} */
export default [
  ...defaultConfig,

  // Ignore non-source files and Prisma assets
  {
    ignores: [
      'prisma/**',
      '**/*.sql',
      '**/*.toml',
      '**/*.prisma',
      '**/*.db',
      'tsconfig*.json',
    ],
  },

  // Base
  {
    plugins: { react, unicorn, filenames },
    settings: { react: { version: 'detect' } },
    rules: {
      'react/function-component-definition': 'off',
      // Relax filename policy to match current codebase
      'unicorn/filename-case': 'off',
      // Disabled due to incompatibility of eslint-plugin-filenames options with ESLint v9 flat config
      'filenames/match-exported': 'off',
    },
  },

  // Hooks → camelCase
  {
    files: ['**/use*.{ts,tsx}'],
    plugins: { unicorn, filenames },
    rules: {
      'unicorn/filename-case': 'off',
      'filenames/match-exported': 'off',
    },
  },

  // Components → PascalCase
  {
    files: ['app/components/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
    plugins: { unicorn, filenames },
    rules: {
      'unicorn/filename-case': 'off',
      'filenames/match-exported': 'off',
    },
  },

  // Context / providers → PascalCase
  {
    files: ['app/context/**/*.{ts,tsx}', 'src/context/**/*.{ts,tsx}'],
    plugins: { unicorn, filenames },
    rules: {
      'unicorn/filename-case': 'off',
      'filenames/match-exported': 'off',
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
    plugins: { unicorn, filenames },
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
    plugins: { unicorn, filenames },
    rules: {
      'unicorn/filename-case': 'off',
      'filenames/match-exported': 'off',
    },
  },
];
