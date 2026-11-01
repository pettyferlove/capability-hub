import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import eslintConfigPrettier from 'eslint-config-prettier';
import jsdoc from 'eslint-plugin-jsdoc';
import tsdoc from 'eslint-plugin-tsdoc';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['**/node_modules/**', '**/dist/**', 'output/**', '.data/**', 'documents/**'] },
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.ts', 'scripts/**/*.ts', 'tests/**/*.ts'],
    plugins: { jsdoc, tsdoc },
    // 注释按 TypeScript 语法解析，`@param` 缺类型才不会退化成 JSDoc 方言。
    settings: { jsdoc: { mode: 'typescript' } },
    rules: {
      'tsdoc/syntax': 'warn',
      'jsdoc/no-types': 'error',
      // publicOnly 只覆盖导出函数，选择器补上导出的类、接口、类型别名和常量。
      'jsdoc/require-jsdoc': [
        'warn',
        {
          publicOnly: true,
          contexts: [
            'ExportNamedDeclaration > ClassDeclaration',
            'ExportNamedDeclaration > TSInterfaceDeclaration',
            'ExportNamedDeclaration > TSTypeAliasDeclaration',
            'ExportNamedDeclaration > VariableDeclaration',
          ],
        },
      ],
    },
  },
  {
    // Tailwind 类串与图标名常量由取值本身说明用途，逐条 TSDoc 只会复述标识符。
    files: [
      'apps/web/src/**/styles.ts',
      'apps/web/src/shared/styles/recipes.ts',
      'apps/web/src/shared/icons/*.ts',
      'apps/web/src/shared/components/*-icons.ts',
    ],
    rules: { 'jsdoc/require-jsdoc': 'off' },
  },
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.ts', 'scripts/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-deprecated': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: ['tests/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-deprecated': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['scripts/**/*.mjs', 'bin/**/*.mjs', 'eslint.config.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { globals: { ...globals.node } },
  },
  // 关闭与 Prettier 重叠的排版规则；必须放在最后一组，否则会被上面的规则重新打开。
  eslintConfigPrettier,
);
