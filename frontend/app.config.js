// Dynamic config on top of app.json. EXPO_BASE_URL lets the web build live under a sub-path
// (e.g. GitHub Pages serves this repo at https://<user>.github.io/Zeekay-Game-World/).
module.exports = ({ config }) => ({
  ...config,
  experiments: { ...config.experiments, baseUrl: process.env.EXPO_BASE_URL || "" },
});
