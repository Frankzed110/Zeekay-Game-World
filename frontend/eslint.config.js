// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    files: ['scripts/**/*.js', 'tests/e2e/**/*.js', 'app.config.js'],
    languageOptions: { globals: { module: 'readonly', __dirname: 'readonly', require: 'readonly', console: 'readonly', process: 'readonly', localStorage: 'readonly', document: 'readonly', window: 'readonly' } },
  },
]);
