import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dev-dist',
      'coverage',
      'data',
      'node_modules',
      'src/core/airports/airports.data.json',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['src/app/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['*.{ts,js}', 'scripts/**/*.{ts,js}'],
    languageOptions: { globals: globals.node },
  },
  {
    // Domain core must stay pure: no React, no UI, no storage, no DOM/browser APIs.
    files: ['src/core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'src/core must not depend on React.' },
            { name: 'react-dom', message: 'src/core must not depend on React.' },
          ],
          patterns: [
            { group: ['react/*', 'react-dom/*'], message: 'src/core must not depend on React.' },
            {
              group: ['@app', '@app/*', '**/app/**', '**/src/app', '**/src/app/**'],
              message: 'src/core must not import from src/app.',
            },
            {
              group: [
                '@storage',
                '@storage/*',
                '**/storage/**',
                '**/src/storage',
                '**/src/storage/**',
              ],
              message: 'src/core must not import from src/storage.',
            },
          ],
        },
      ],
    },
  },
);
