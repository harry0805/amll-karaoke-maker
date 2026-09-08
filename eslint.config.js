import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

export default defineConfig(
  globalIgnores([
    'node_modules/**',
    'dist/**',
    'out/**',
    'coverage/**',
    '.cache/**',
    '.svelte-check/**',
    '.renders/**',
    '.wrangler/**',
    '.agents/**',
    '.codex/**',
    'patches/**',
    'public/fonts/**',
  ]),
  js.configs.recommended,
  ts.configs.recommended,
  svelte.configs.recommended,
  {
    files: ['src/**/*.{ts,js,svelte}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['*.{js,ts}', 'scripts/**/*.ts', 'tests/**/*.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.bun } },
  },
  {
    files: ['tests/**/*.ts'],
    languageOptions: { globals: globals.browser },
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: { parser: ts.parser, svelteConfig },
    },
    rules: { 'svelte/require-each-key': 'off' },
  },
  prettier,
  svelte.configs.prettier,
);
