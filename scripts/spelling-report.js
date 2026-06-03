#!/usr/bin/env node
/**
 * Report words spelled differently across bhajans; fix only after you choose.
 *
 *   npm run spelling-report              → scan + HTML/MD report (no content changes)
 *   npm run spelling-report -- --apply   → apply output/spelling-choices.json
 *
 * Workflow:
 *   1. Open output/spelling-report.html in a browser
 *   2. For each group: Fix (pick standard form) or Ignore
 *   3. Download spelling-choices.json → save as output/spelling-choices.json
 *   4. npm run spelling-report -- --apply
 */
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./lib/paths');
const { loadSections } = require('./lib/sections');
const {
  scanCorpus,
  buildClusters,
  loadChoices,
  applyChoices,
  renderHtmlReport,
  renderMarkdownReport,
  defaultChoices,
} = require('./lib/spelling-variants');

const OUT_DIR = path.join(ROOT, 'output');
const DATA_JSON = path.join(OUT_DIR, 'spelling-data.json');
const CHOICES_JSON = path.join(OUT_DIR, 'spelling-choices.json');
const HTML_OUT = path.join(OUT_DIR, 'spelling-report.html');
const MD_OUT = path.join(OUT_DIR, 'spelling-report.md');

async function main() {
  const doApply = process.argv.includes('--apply');
  const config = loadSections();

  if (doApply) {
    if (!fs.existsSync(CHOICES_JSON)) {
      console.error(`Missing ${CHOICES_JSON}`);
      console.error('Run npm run spelling-report, choose Fix/Ignore in HTML, save choices there.');
      process.exit(1);
    }
    const wordIndex = scanCorpus(config);
    const clusters = buildClusters(wordIndex);
    const choices = loadChoices(CHOICES_JSON, clusters);
    const { filesUpdated, replacements } = applyChoices(config, choices);
    console.log(`Applied ${replacements} replacement(s) across ${filesUpdated} file(s).`);
    console.log('Review diff, then: npm run build');
    return;
  }

  console.log('Scanning corpus for spelling variants…');
  const wordIndex = scanCorpus(config);
  const clusters = buildClusters(wordIndex);
  const choices = loadChoices(CHOICES_JSON, clusters);

  if (!fs.existsSync(CHOICES_JSON)) {
    fs.writeFileSync(CHOICES_JSON, JSON.stringify(choices, null, 2), 'utf8');
    console.log(`Created template (all Ignore): ${CHOICES_JSON}`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(DATA_JSON, JSON.stringify({ clusters, generated: new Date().toISOString() }, null, 2), 'utf8');
  fs.writeFileSync(HTML_OUT, renderHtmlReport(clusters, choices), 'utf8');
  fs.writeFileSync(MD_OUT, renderMarkdownReport(clusters, choices), 'utf8');

  console.log(`Found ${clusters.length} variant group(s).`);
  console.log(`  ${HTML_OUT}`);
  console.log(`  ${MD_OUT}`);
  console.log(`  ${CHOICES_JSON} (edit via HTML or by hand)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
