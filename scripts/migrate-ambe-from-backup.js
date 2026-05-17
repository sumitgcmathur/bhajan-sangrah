#!/usr/bin/env node
/**
 * Migrate content/ambe/*.yaml from backup using migrateDoc (not aarti couplet rules).
 * Writes content/ambe/migration-report.json and migration-report.md
 */
const fs = require('fs');
const path = require('path');
const { CONTENT } = require('./lib/paths');
const { loadBhajanDoc, dumpBhajanDoc } = require('./lib/yaml-io');
const { cleanLyricsText } = require('./lib/clean-lyrics');
const {
  analyzeBhajanLyrics,
  extractTarzFromText,
  flattenLyricsText,
  isStructuredLyrics,
} = require('./lib/lyrics-structure');
const { migrateAmbeDoc } = require('./lib/ambe-lyrics');

function lineCount(text) {
  return String(text || '')
    .split('\n')
    .filter((l) => l.trim()).length;
}

const SECTION = 'ambe';
const backupRoot = process.argv[2] || 'content-backup-20260517-123521';
const backupDir = path.join(path.dirname(CONTENT), path.basename(backupRoot), SECTION);
const outDir = path.join(CONTENT, SECTION);

if (!fs.existsSync(backupDir)) {
  console.error(`Backup ambe folder not found: ${backupDir}`);
  process.exit(1);
}

function backupLyricsText(doc) {
  if (!doc.lyrics) return '';
  return isStructuredLyrics(doc.lyrics) ? flattenLyricsText(doc.lyrics) : String(doc.lyrics);
}

function postMigrateFlags(doc) {
  const flags = [];
  const lyrics = doc.lyrics;
  if (!lyrics || typeof lyrics !== 'object' || !('paragraphs' in lyrics)) {
    flags.push('not-structured');
    return flags;
  }
  if (!doc.tarz) flags.push('no-tarz-field');
  const sthayi = String(lyrics.sthayi || '');
  const paras = lyrics.paragraphs || [];
  const allText = [sthayi, ...paras].join('\n');
  if (/\(\s*तर्ज|^\s*तर्ज\s*[-:：]/im.test(sthayi)) flags.push('tarz-left-in-sthayi');
  if (/&#\d+;|&#x[0-9a-f]+;/i.test(allText)) flags.push('html-entities');
  if (/\.\.\./.test(allText)) flags.push('ellipsis-refrain-shorthand');
  const multiline = paras.filter((p) => String(p).includes('\n')).length;
  if (multiline) flags.push(`multiline-paragraphs:${multiline}`);
  const verseMarkers = (allText.match(/॥\s*[०-९\dटेर]+/g) || []).length;
  if (verseMarkers) flags.push(`verse-markers-in-text:${verseMarkers}`);
  if (!sthayi.trim() && paras.length) flags.push('empty-sthayi');
  if (sthayi.trim() && !paras.length) flags.push('no-paragraphs');
  return flags;
}

function migrationStrategy(migrated) {
  return migrated._ambeStrategy || 'unknown';
}

const files = fs
  .readdirSync(backupDir)
  .filter((n) => n.endsWith('.yaml'))
  .sort();

const rows = [];

for (const name of files) {
  const backupPath = path.join(backupDir, name);
  const targetPath = path.join(outDir, name);
  const backupDoc = loadBhajanDoc(fs.readFileSync(backupPath, 'utf8'));
  const raw = backupLyricsText(backupDoc);
  const { tarz: embeddedTarz, rest } = extractTarzFromText(raw);
  const forAnalysis = cleanLyricsText(rest);
  const analysis = analyzeBhajanLyrics(forAnalysis, backupDoc.title);

  const migrated = migrateAmbeDoc({ ...backupDoc });
  const strategy = migrationStrategy(migrated);
  delete migrated._ambeStrategy;
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(targetPath, dumpBhajanDoc(migrated), 'utf8');

  const postFlags = postMigrateFlags(migrated);
  const sthayiLines = lineCount(migrated.lyrics?.sthayi || '');
  const paragraphCount = (migrated.lyrics?.paragraphs || []).length;

  let tier = analysis.tier;
  let score = analysis.score;
  if (postFlags.includes('tarz-left-in-sthayi')) {
    score = Math.max(0, score - 25);
    tier = score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low';
  }
  if (postFlags.includes('html-entities')) score = Math.max(0, score - 8);

  rows.push({
    file: `content/${SECTION}/${name}`,
    title: migrated.title || backupDoc.title || '',
    score,
    tier,
    backupStrategy: analysis.strategy,
    migratedStrategy: strategy,
    ambeShape: strategy,
    tarz: migrated.tarz || embeddedTarz || null,
    sthayiLines,
    paragraphCount,
    backupLineCount: analysis.lineCount,
    flags: [...new Set([...(analysis.flags || []), ...postFlags])],
    reasons: analysis.reasons,
    manualReview: tier === 'low' || postFlags.some((f) => f.startsWith('tarz-') || f === 'html-entities'),
  });
}

const byTier = { high: [], medium: [], low: [] };
for (const r of rows) byTier[r.tier].push(r);

const report = {
  generatedAt: new Date().toISOString(),
  section: SECTION,
  backup: backupDir.replace(/\\/g, '/'),
  total: rows.length,
  summary: {
    high: byTier.high.length,
    medium: byTier.medium.length,
    low: byTier.low.length,
    manualReview: rows.filter((r) => r.manualReview).length,
    withTarz: rows.filter((r) => r.tarz).length,
    stanzaBlocks: rows.filter((r) => r.migratedStrategy === 'stanza-blocks').length,
    firstLineSthayi: rows.filter((r) => r.migratedStrategy === 'first-line-sthayi').length,
  },
  files: rows,
};

const outJson = path.join(outDir, 'migration-report.json');
fs.writeFileSync(outJson, JSON.stringify(report, null, 2), 'utf8');

const md = [];
md.push('# Ambe section — migration report\n');
md.push(`Generated: ${report.generatedAt}\n`);
md.push(`Source: \`${report.backup}\` → \`content/ambe/\`\n`);
md.push('**Note:** Aarti was not modified. Ambe uses standard `sthayi` + `paragraphs` (not aarti couplet pairing).\n');
md.push('| Metric | Count |');
md.push('|--------|------:|');
md.push(`| Total | ${report.total} |`);
md.push(`| High confidence (≥80) | ${report.summary.high} |`);
md.push(`| Medium (60–79) | ${report.summary.medium} |`);
md.push(`| Low (<60) | ${report.summary.low} |`);
md.push(`| With तर्ज field | ${report.summary.withTarz} |`);
md.push(`| Stanza-block shape | ${report.summary.stanzaBlocks} |`);
md.push(`| One line per paragraph | ${report.summary.firstLineSthayi} |`);
md.push(`| Flagged for manual review | ${report.summary.manualReview} |\n`);

md.push('## Per file\n');
md.push('| File | Score | Tier | Shape | तर्ज | Paragraphs | Flags |');
md.push('|------|------:|------|-------|-----|------------:|-------|');
for (const r of rows) {
  const flags = r.flags?.length ? r.flags.join(', ') : '—';
  const tarz = r.tarz ? r.tarz.slice(0, 40) + (r.tarz.length > 40 ? '…' : '') : '—';
  md.push(
    `| \`${path.basename(r.file)}\` | ${r.score} | ${r.tier} | ${r.migratedStrategy} | ${tarz} | ${r.paragraphCount} | ${flags} |`
  );
}

md.push('\n## Manual review suggested\n');
for (const r of rows.filter((x) => x.manualReview)) {
  md.push(`- **${r.score}** \`${path.basename(r.file)}\` — ${r.title}${r.flags?.length ? ` _(${r.flags.join(', ')})_` : ''}`);
}
if (!rows.some((x) => x.manualReview)) md.push('_None — spot-check medium tier if desired._\n');

const outMd = path.join(outDir, 'migration-report.md');
fs.writeFileSync(outMd, md.join('\n'), 'utf8');

console.log(`Migrated ${rows.length} ambe files from backup`);
console.log(`  High:   ${report.summary.high}`);
console.log(`  Medium: ${report.summary.medium}`);
console.log(`  Low:    ${report.summary.low}`);
console.log(`  Review: ${report.summary.manualReview}`);
console.log(`Wrote ${outJson}`);
console.log(`Wrote ${outMd}`);
