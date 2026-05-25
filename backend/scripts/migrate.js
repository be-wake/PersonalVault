'use strict';

/**
 * Programmatic migration runner — bypasses the node-pg-migrate CLI (yargs)
 * so the script works on Node.js v20+ including v25 where the yargs shim has
 * an ESM-resolution issue. Dynamic import() supports both the v7 (CJS) and
 * v8 (ESM-only) distributions of node-pg-migrate.
 *
 * Usage:
 *   node scripts/migrate.js           # up (default)
 *   node scripts/migrate.js up
 *   node scripts/migrate.js down
 *
 * DATABASE_URL must be set in the environment. In local dev add it to .env
 * and run:  node --env-file=.env scripts/migrate.js
 */

const path = require('path');

const direction    = process.argv[2] || 'up';
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is not set.');
  console.error('  Local dev:  node --env-file=.env scripts/migrate.js');
  console.error('  CI:         set DATABASE_URL as a GitHub Actions repository secret');
  process.exit(1);
}

// Dynamic import works in CJS files and supports both node-pg-migrate v7 (CJS)
// and v8 (ESM-only) without any special configuration.
import('node-pg-migrate').then(({ runner, default: defaultExport }) => {
  // v8 exports runner as a named export; v7 exported it on .runner
  const migrate = runner ?? defaultExport;

  return migrate({
    databaseUrl: DATABASE_URL,
    dir: path.join(__dirname, '..', 'src', 'migrations'),
    direction,
    count: Infinity,
    verbose: true,
    migrationsTable: 'pgmigrations',
  });
}).then(() => {
  console.log(`\n✅ Migration "${direction}" completed successfully.`);
  process.exit(0);
}).catch((err) => {
  console.error(`\n❌ Migration "${direction}" failed:`, err.message);
  process.exit(1);
});
