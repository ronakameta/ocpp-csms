import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Only src/shared/config.ts may read process.env.
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Import config from src/shared/config.ts instead.',
        },
      ],
    },
  },
  {
    files: ['src/shared/config.ts', '*.config.js', '*.config.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
);
