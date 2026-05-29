// API base URL and secure-storage keys. Override the URL at build time with
// `--dart-define=API_URL=...`.
const kApiUrl = String.fromEnvironment(
  'API_URL',
  defaultValue: 'https://pdv-api.niceground-cc94fda7.eastus.azurecontainerapps.io',
);

const kAccessTokenKey = 'pdv_token';
const kRefreshTokenKey = 'pdv_refresh_token';
