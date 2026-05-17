#!/usr/bin/env node
/**
 * Migrate content/horiya/*.yaml from backup (ganpati-style hooks + ambe shapes).
 * Writes only under content/horiya/.
 *
 *   node scripts/migrate-horiya-from-backup.js
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
const { migrateHoriyaDoc } = require('./lib/horiya-lyrics');

const SECTION = 'horiya';
const backupRoot = process.argv[2] || 'content-backup-20260517-123521';
const backupDir = path.join(path.dirname(CONTENT), path.basename(backupRoot), SECTION);
const outDir = path.join(CONTENT, SECTION);

if (!fs.existsSync(backupDir)) {
  console.error(`Backup folder not found: ${backupDir}`);
  process.exit(1);
}

function lineCount(text) {
  return String(text || '')
    .split('\n')
    .filter((l) => l.trim()).length;
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
  if (/^\s*[\(（]?\s*तर्ज/im.test(sthayi)) flags.push('tarz-left-in-sthayi');
  if (/&#\d+;|&#x[0-9a-f]+;/i.test(allText)) flags.push('html-entities');
  if (/\.\.\./.test(allText)) flags.push('ellipsis-in-text');
  const multiline = paras.filter((p) => String(p).includes('\n')).length;
  if (multiline) flags.push(`multiline-paragraphs:${multiline}`);
  if (!sthayi.trim() && paras.length) flags.push('empty-sthayi');
  if (sthayi.trim() && !paras.length) flags.push('no-paragraphs');
  return flags;
}

const files = fs.readdirSync(backupDir).filter((n) => n.endsWith('.yaml')).sort();
const rows = [];

for (const name of files) {
  const backupPath = path.join(backupDir, name);
  const targetPath = path.join(outDir, name);
  const backupDoc = loadBhajanDoc(fs.readFileSync(backupPath, 'utf8'));
  const raw = backupLyricsText(backupDoc);
  const { tarz: embeddedTarz, rest } = extractTarzFromText(raw);
  const analysis = analyzeBhajanLyrics(cleanLyricsText(rest), backupDoc.title);

  const migrated = migrateHoriyaDoc({ ...backupDoc });
  const strategy = migrated._horiyaStrategy || 'unknown';
  delete migrated._horiyaStrategy;
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(targetPath, dumpBhajanDoc(migrated), 'utf8');

  const postFlags = postMigrateFlags(migrated);
  const backupLines = lineCount(rest);
  const sthayiLines = lineCount(migrated.lyrics?.sthayi || '');
  const paragraphCount = (migrated.lyrics?.paragraphs || []).length;
  const proposedLines =
    sthayiLines +
    (migrated.lyrics?.paragraphs || []).reduce((n, p) => n + lineCount(p), 0);

  let tier = analysis.tier;
  let score = analysis.score;
  if (postFlags.includes('tarz-left-in-sthayi')) {
    score = Math.max(0, score - 25);
    tier = score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low';
  }
  if (proposedLines < backupLines * 0.75) {
    postFlags.push('possible-content-loss');
    score = Math.max(0, score - 20);
    tier = score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low';
  }

  rows.push({
    file: `content/${SECTION}/${name}`,
    title: backupDoc.title || '',
    score,
    tier,
    strategy,
    backupLines,
    proposedLines,
    sthayiLines,
    paragraphCount,
    tarz: migrated.tarz || embeddedTarz || null,
    flags: postFlags,
    manualReview: tier !== 'high' || postFlags.length > 1,
  });
}

const byStrategy = {};
for (const r of rows) {
  byStrategy[r.strategy] = (byStrategy[r.strategy] || 0) + 1;
}

const report = {
  generatedAt: new Date().toISOString(),
  section: SECTION,
  backup: backupDir.replace(/\\/g, '/'),
  total: rows.length,
  summary: {
    high: rows.filter((r) => r.tier === 'high').length,
    medium: rows.filter((r) => r.tier === 'medium').length,
    low: rows.filter((r) => r.tier === 'low').length,
    manualReview: rows.filter((r) => r.manualReview).length,
    strategies: byStrategy,
  },
  files: rows,
};

fs.writeFileSync(path.join(outDir, 'migration-report.json'), JSON.stringify(report, null, 2), 'utf8');

const md = [
  '# Horiya — migration report\n',
  `Generated: ${report.generatedAt}\n`,
  '| File | Score | Tier | Strategy | ¶ | Lines | Flags |',
  '|------|------:|------|----------|--:|------:|-------|',
  ...rows.map((r) => {
    const flags = r.flags?.length ? r.flags.join(', ') : '—';
    return `| \`${path.basename(r.file)}\` | ${r.score} | ${r.tier} | ${r.strategy} | ${r.paragraphCount} | ${r.proposedLines}/${r.backupLines} | ${flags} |`;
  }),
];

fs.writeFileSync(path.join(outDir, 'migration-report.md'), md.join('\n'), 'utf8');

console.log(`Migrated ${rows.length} horiya files → ${outDir}`);
console.log(`  Strategies: ${JSON.stringify(byStrategy)}`);
console.log(`  Manual review: ${report.summary.manualReview}`);
