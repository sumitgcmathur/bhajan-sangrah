#!/usr/bin/env node
/**
 * Validate bhajan YAML against the site schema (unknown keys, parse drops, empty lyrics).
 * Does not modify files. Exit 0 always — use in build for notifications only.
 *
 *   node scripts/lint-schema.js
 */
const path = require('path');
const { ROOT } = require('./lib/paths');
const { loadSections } = require('./lib/sections');
const {
  validateAllBhajans,
  printSchemaWarnings,
  writeSchemaReport,
} = require('./lib/bhajan-schema');

async function main() {
  const config = loadSections();
  const byFile = validateAllBhajans(config);
  const gh = process.env.GITHUB_ACTIONS === 'true';
  printSchemaWarnings(byFile, { githubActions: gh });
  const reportPath = writeSchemaReport(byFile, path.join(ROOT, 'output'));
  console.log(`Report: ${reportPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
