// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

module.exports = defineConfig([
  {
    ignores: ['src/app/api-client/**', '**/*.spec.ts', 'src/test-setup.ts', 'src/test-mocks/**'],
  },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      'no-useless-assignment': 'off',
      'no-empty': 'off',
      '@angular-eslint/prefer-inject': 'off',
      '@angular-eslint/no-empty-lifecycle-method': 'off',
      '@angular-eslint/no-input-rename': 'off',
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': 'off',
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {
      '@angular-eslint/template/click-events-have-key-events': 'off',
      '@angular-eslint/template/interactive-supports-focus': 'off',
      '@angular-eslint/template/no-negated-async': 'off',
      '@angular-eslint/template/label-has-associated-control': 'off',
      '@angular-eslint/template/i18n': [
        'error',
        {
          checkId: false,
          checkText: true,
          checkAttributes: false,
        },
      ],
    },
  },
  {
    files: ['**/login.component.html'],
    rules: {
      '@angular-eslint/template/i18n': 'off',
    },
  },
]);
