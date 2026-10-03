import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  { ignores: ['**/node_modules/', '**/dist/', '**/coverage/', 'notes/', 'reports/'] },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.jsx'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    // Security invariant 1: the quarantined Reader/Drafter reads attacker text, so it must
    // never be able to reach tools, Google write access or memory (SECURITY_APPROACH §7.3).
    files: ['server/src/security/reader/**/*.js'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/agent/**', '**/actions/**', '**/google/**', '**/MemoryRepository*'],
              message:
                'Reader/Drafter are quarantined: no tools, Google or memory access (SECURITY_APPROACH §7.3).',
            },
          ],
        },
      ],
    },
  },
  {
    // The dashboard runs in the browser; hooks rules catch the classic React mistakes.
    files: ['web/src/**/*.{js,jsx}', 'web/test/**/*.{js,jsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  prettier,
];
