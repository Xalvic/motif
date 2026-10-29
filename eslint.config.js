import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'prototype'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    languageOptions: { globals: globals.browser },
  },
  {
    // Core code must stay deterministic and pure: use the rng from random.ts, and no
    // app, UI or audio imports.
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Pass an rng from theory/random.ts.' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@motif/web', '@motif/web/*', 'react', 'react-*', 'tone', 'smplr', 'zustand'],
              message: 'Core is pure: no app, UI or audio imports.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
