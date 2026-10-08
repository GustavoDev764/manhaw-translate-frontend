import tseslint from 'typescript-eslint'
import local from './eslint-rules/no-comments.mjs'

export default [
  {
    ignores: ['node_modules/**', 'dist/**'],
  },
  {
    files: ['**/*.{ts,tsx,js,mjs,cjs}'],
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'off' },
    languageOptions: { parser: tseslint.parser, ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { local },
    rules: { 'local/no-comments': 'error' },
  },
]
