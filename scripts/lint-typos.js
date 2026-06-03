#!/usr/bin/env node
/**
 * Scan bhajan text for common typos; write per-bhajan report.
 * Usage:
 *   node scripts/lint-typos.js           → output/typo-report.md + .html
 *   node scripts/lint-typos.js --fix     → apply safe auto-fixes, then report
 */
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./lib/paths');
const { loadSections } = require('./lib/sections');
const {
  scanAll,
  applyAutoFixes,
  renderMarkdownReport,
  renderHtmlReport,
} = require('./lib/typo-lint');

const OUT_DIR = path.join(ROOT, 'output');
const MD_OUT = path.join(OUT_DIR, 'typo-report.md');
const HTML_OUT = path.join(OUT_DIR, 'typo-report.html');

async function main() {
  const doFix = process.argv.includes('--fix');
  const config = loadSections();

  if (doFix) {
    const { filesUpdated, fixesApplied } = applyAutoFixes(config);
    console.log(`Auto-fix: ${fixesApplied} change(s) in ${filesUpdated} file(s).`);
  }

  const results = scanAll(config);
  const md = renderMarkdownReport(results);
  const html = renderHtmlReport(results);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(MD_OUT, md, 'utf8');
  fs.writeFileSync(HTML_OUT, html, 'utf8');

  const total = results.reduce((n, r) => n + r.issues.length, 0);
  console.log(`Report: ${results.length} bhajan(s), ${total} issue(s).`);
  console.log(`  ${MD_OUT}`);
  console.log(`  ${HTML_OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
