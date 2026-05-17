#!/usr/bin/env node
/**
 * Analyze / migrate content/ambikacharitra from backup.
 * Writes only under content/ambikacharitra/ (report + optional YAML).
 *
 *   node scripts/migrate-ambikacharitra-from-backup.js           # report only
 *   node scripts/migrate-ambikacharitra-from-backup.js --write   # apply YAML
 *   node scripts/migrate-ambikacharitra-from-backup.js --fix-jabani  # move जबानी out of paragraphs
 */
const fs = require('fs');
const path = require('path');
const { CONTENT } = require('./lib/paths');
const { loadBhajanDoc, dumpBhajanDoc } = require('./lib/yaml-io');
const { isStructuredLyrics, flattenLyricsText } = require('./lib/lyrics-structure');
const {
  migrateAmbikaCharitraDoc,
  analyzeAmbikaCharitraMigration,
  normalizeJabaniLyrics,
} = require('./lib/ambikacharitra-lyrics');

const write = process.argv.includes('--write');
const fixJabani = process.argv.includes('--fix-jabani');
const backupRoot =
  process.argv.find((a) => !a.startsWith('--') && a.includes('content-backup')) ||
  'content-backup-20260517-123521';
const SECTION = 'ambikacharitra';
const backupDir = path.join(path.dirname(CONTENT), path.basename(backupRoot), SECTION);
const outDir = path.join(CONTENT, SECTION);

if (!fs.existsSync(backupDir) && !fixJabani) {
  console.error(`Backup folder not found: ${backupDir}`);
  process.exit(1);
}

function loadCurrent(name) {
  const p = path.join(outDir, name);
  if (!fs.existsSync(p)) return null;
  return loadBhajanDoc(fs.readFileSync(p, 'utf8'));
}

const files = fs.existsSync(backupDir)
  ? fs.readdirSync(backupDir).filter((n) => n.endsWith('.yaml')).sort()
  : [];
const rows = [];
const byShape = {};
const byTier = { high: [], medium: [], low: [] };

if (fixJabani) {
  const yamlFiles = fs.readdirSync(outDir).filter((n) => n.endsWith('.yaml'));
  let updated = 0;
  for (const name of yamlFiles) {
    const p = path.join(outDir, name);
    const doc = loadBhajanDoc(fs.readFileSync(p, 'utf8'));
    if (!isStructuredLyrics(doc.lyrics)) continue;
    const lyrics = normalizeJabaniLyrics(doc.lyrics);
    if (JSON.stringify(lyrics) === JSON.stringify(doc.lyrics)) continue;
    fs.writeFileSync(p, dumpBhajanDoc({ ...doc, lyrics }), 'utf8');
    updated += 1;
  }
  console.log(`--fix-jabani: moved जबानी out of paragraphs in ${updated} file(s)`);
}

for (const name of files) {
  const backupDoc = loadBhajanDoc(fs.readFileSync(path.join(backupDir, name), 'utf8'));
  const currentDoc = loadCurrent(name);
  const analysis = analyzeAmbikaCharitraMigration(backupDoc, currentDoc);

  if (write) {
    const migrated = migrateAmbikaCharitraDoc({ ...backupDoc });
    delete migrated._charitraShape;
    migrated.lyrics = normalizeJabaniLyrics(migrated.lyrics);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, name), dumpBhajanDoc(migrated), 'utf8');
  }

  const row = {
    file: `content/${SECTION}/${name}`,
    title: backupDoc.title || '',
    score: analysis.score,
    tier: analysis.tier,
    shape: analysis.shape,
    currentShape: analysis.currentShape,
    tarz: analysis.tarz,
    backupLineCount: analysis.backupLineCount,
    proposedLineCount: analysis.proposedLineCount,
    sthayiLines: analysis.sthayiLines,
    paragraphCount: analysis.paragraphCount,
    flags: analysis.flags,
    manualReview: analysis.manualReview,
  };
  rows.push(row);
  byShape[analysis.shape] = (byShape[analysis.shape] || 0) + 1;
  byTier[analysis.tier].push(row);
}

const report = {
  generatedAt: new Date().toISOString(),
  section: SECTION,
  backup: backupDir.replace(/\\/g, '/'),
  mode: write ? 'write' : 'report-only',
  total: rows.length,
  summary: {
    high: byTier.high.length,
    medium: byTier.medium.length,
    low: byTier.low.length,
    manualReview: rows.filter((r) => r.manualReview).length,
    withTarz: rows.filter((r) => r.tarz).length,
    shapes: byShape,
  },
  rules: {
    stuti_doha: 'Short 2-line doha blocks (aarti-style couplets)',
    'stuti-haan-doha': 'हां हां … lines paired per antara',
    'stuti-single': 'One scraped line per paragraph (short stuti)',
    'triplet-refrain': '3-line antaras ending जब शंख / जै जै',
    'narrative-couplet': 'Numbered verses, mostly 2 lines per block',
    doha_numbered: 'Short numbered single-line dohas',
    'narrative-prose': 'Long lines, one paragraph each',
    'narrative-ter': 'Opening टेर line + long narrative',
    'narrative-numbered': 'Numbered long single lines',
    'narrative-mixed': 'Fallback — manual check',
  },
  files: rows,
};

const outJson = path.join(outDir, 'migration-report.json');
fs.writeFileSync(outJson, JSON.stringify(report, null, 2), 'utf8');

const md = [];
md.push('# Ambika Charitra — migration report\n');
md.push(`Generated: ${report.generatedAt}\n`);
md.push(`Mode: **${report.mode}** · Source: \`${report.backup}\`\n`);
md.push('Aarti and ambe were not modified.\n');
md.push('| Metric | Count |');
md.push('|--------|------:|');
md.push(`| Total | ${report.total} |`);
md.push(`| High (≥80) | ${report.summary.high} |`);
md.push(`| Medium (60–79) | ${report.summary.medium} |`);
md.push(`| Low (<60) | ${report.summary.low} |`);
md.push(`| With तर्ज/राग field | ${report.summary.withTarz} |`);
md.push(`| Manual review suggested | ${report.summary.manualReview} |\n`);

md.push('### Detected shapes\n');
for (const [shape, count] of Object.entries(report.summary.shapes).sort((a, b) => b[1] - a[1])) {
  const desc = report.rules[shape] || '';
  md.push(`- **${shape}** (${count})${desc ? ` — ${desc}` : ''}`);
}
md.push('');

md.push('## Per file\n');
md.push('| File | Score | Tier | Proposed shape | Current | ¶ | Flags |');
md.push('|------|------:|------|----------------|---------|--:|-------|');
for (const r of rows) {
  const flags = r.flags?.length ? r.flags.join(', ') : '—';
  md.push(
    `| \`${path.basename(r.file)}\` | ${r.score} | ${r.tier} | ${r.shape} | ${r.currentShape} | ${r.paragraphCount} | ${flags} |`
  );
}

md.push('\n## Manual review suggested\n');
const review = rows.filter((r) => r.manualReview);
if (review.length) {
  for (const r of review) {
    md.push(
      `- **${r.score}** \`${path.basename(r.file)}\` — ${r.title} _(${r.shape}; ${r.flags.join(', ') || 'flags'})_`
    );
  }
} else {
  md.push('_None — spot-check medium tier if desired._\n');
}

fs.writeFileSync(path.join(outDir, 'migration-report.md'), md.join('\n'), 'utf8');

console.log(`${write ? 'Migrated' : 'Analyzed'} ${rows.length} ambikacharitra files`);
console.log(`  High:   ${report.summary.high}`);
console.log(`  Medium: ${report.summary.medium}`);
console.log(`  Low:    ${report.summary.low}`);
console.log(`  Review: ${report.summary.manualReview}`);
console.log(`  Shapes: ${JSON.stringify(report.summary.shapes)}`);
console.log(`Wrote ${outJson}`);
console.log(`Wrote ${path.join(outDir, 'migration-report.md')}`);
if (!write) console.log('\nDry run — pass --write to update YAML files.');
if (!fixJabani) console.log('Pass --fix-jabani to move जबानी lines to lyrics.jabani (no verse numbers).');
