import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import hooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: [
      'dist/**',
      'release/**',
      'node_modules/**',
      'data/**',
      'resources/**',
      'graphify-out/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      globals: globals.node,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/renderer/**/*.{js,jsx}', 'tests/renderer/**/*.{js,jsx}', 'public/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['src/renderer/**/*.{js,jsx}', 'tests/renderer/**/*.{js,jsx}'],
    plugins: { react, 'react-hooks': hooks },
    settings: { react: { version: 'detect' } },
    rules: {
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
      'react-hooks/rules-of-hooks': 'error',
    },
  },
];
