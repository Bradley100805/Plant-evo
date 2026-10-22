import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // The simulation core must stay deterministic and DOM-free.
    files: ['packages/sim/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded Rng from rng/ instead.' },
        { object: 'Date', property: 'now', message: 'The simulation must not read the clock.' },
        {
          object: 'performance',
          property: 'now',
          message: 'The simulation must not read the clock.',
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'The simulation core must not touch the DOM.' },
        { name: 'document', message: 'The simulation core must not touch the DOM.' },
      ],
    },
  },
  {
    files: ['tools/**/*.ts', '*.config.{js,ts}', 'packages/**/*.test.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
);
