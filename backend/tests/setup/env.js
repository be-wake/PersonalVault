'use strict';

// Runs before every test file's module registry is loaded.
// Sets all env vars that source modules read at require-time.

process.env.NODE_ENV = 'test';

// Deterministic 32-byte AES key (44-char base64) — not production-safe
process.env.PDV_FIELD_KEK_BASE64 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

// JWT secrets — long enough to pass the ≥16 char and no "change-me" checks
process.env.JWT_SECRET         = 'test-jwt-access-secret-sufficient-length-1234';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-sufficient-length-5678';
process.env.STEPUP_SECRET      = 'test-stepup-secret-sufficient-length-9012abcd';

// Step-up enforcement ON so requireStepUp actually checks headers in tests
process.env.STEPUP_ENFORCED = 'true';

// Low rate-limit thresholds so tests hit limits quickly
process.env.RATE_LIMIT_AUTH_MAX       = '3';
process.env.RATE_LIMIT_AUTH_WINDOW_MS = '60000';
process.env.RATE_LIMIT_API_MAX        = '10';
process.env.RATE_LIMIT_API_WINDOW_MS  = '60000';

// Webhook secret — not prod-safe but passes the length check
process.env.WEBHOOK_HMAC_SECRET = 'test-webhook-hmac-secret-sufficient-length-xyz';

// Suppress noisy pino output during tests
process.env.LOG_LEVEL = 'silent';
