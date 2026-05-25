'use strict';

const express      = require('express');
const cookieParser = require('cookie-parser');

/**
 * Minimal Express app for route unit tests.
 * Mirrors server.js setup without binding a port or connecting to external services.
 */
function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // Stub req.id so middleware that reads req.id doesn't throw
  app.use((req, _res, next) => {
    req.id = 'test-req-id';
    next();
  });

  return app;
}

module.exports = { makeApp };
