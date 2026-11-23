import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.output/**',
      '**/.nuxt/**',
      '**/coverage/**',
      '**/node_modules/**',
      'apps/web/scripts/.raw/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  { languageOptions: { globals: globals.node } },
  {
    files: ['apps/web/**'],
    languageOptions: { globals: globals.browser },
  },
  {
    // Nuxt pages and layouts are named by route (index.vue, default.vue)
    files: ['apps/web/app/pages/**/*.vue', 'apps/web/app/layouts/**/*.vue'],
    rules: { 'vue/multi-word-component-names': 'off' },
  },
  prettier,
)
