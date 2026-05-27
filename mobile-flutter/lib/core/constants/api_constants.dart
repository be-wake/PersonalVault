const kApiUrl = String.fromEnvironment(
  'API_URL',
  defaultValue: 'https://pdv-api.niceground-cc94fda7.eastus.azurecontainerapps.io',
);

const kAccessTokenKey = 'pdv_token';
const kRefreshTokenKey = 'pdv_refresh_token';
