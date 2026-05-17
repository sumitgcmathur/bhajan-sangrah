#!/usr/bin/env node
/**
 * Convert aarti folder from backup — only writes when pattern matches simple 2-line blocks.
 * Unsupported files are skipped (existing content preserved) and listed in a report.
 *
 * Usage:
 *   node scripts/convert-aarti-couplet.js
 *   node scripts/convert-aarti-couplet.js [backup-aarti-dir]
 *   node scripts/convert-aarti-couplet.js --force   # write even when flagged (not recommended)
 */
const fs = require('fs');
const path = require('path');
const { CONTENT } = require('./lib/paths');
const { loadBhajanDoc, dumpBhajanDoc } = require('./lib/yaml-io');
const { analyzeAartiConversion } = require('./lib/aarti-couplet-convert');

const force = process.argv.includes('--force');
const backupArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
const backupAartiDir = path.resolve(
  backupArg || path.join(CONTENT, '..', 'content-backup-20260517-123521', 'aarti')
);
const outAartiDir = path.join(CONTENT, 'aarti');
const reportPath = path.join(outAartiDir, 'conversion-report.json');

if (!fs.existsSync(backupAartiDir)) {
  console.error(`Backup aarti dir not found: ${backupAartiDir}`);
  process.exit(1);
}

const files = fs.readdirSync(backupAartiDir).filter((n) => n.endsWith('.yaml'));
const converted = [];
const skipped = [];

for (const name of files.sort()) {
  const backupPath = path.join(backupAartiDir, name);
  const outPath = path.join(outAartiDir, name);
  const doc = loadBhajanDoc(fs.readFileSync(backupPath, 'utf8'));
  const raw = typeof doc.lyrics === 'string' ? doc.lyrics : '';

  if (!raw.trim()) {
    skipped.push({ file: name, issues: [{ code: 'empty-backup', detail: 'no flat lyrics' }] });
    console.warn(`SKIP ${name}: empty backup lyrics`);
    continue;
  }

  const analysis = analyzeAartiConversion(raw, doc.title || '');

  if (!analysis.autoSafe && !force) {
    skipped.push({
      file: name,
      title: doc.title,
      issues: analysis.issues,
      stats: analysis.stats,
    });
    const codes = analysis.issues.map((i) => i.code).join(', ');
    console.warn(`SKIP ${name}: ${codes}`);
    for (const i of analysis.issues) {
      console.warn(`       ${i.code}: ${i.detail}`);
    }
    continue;
  }

  if (!analysis.autoSafe && force) {
    console.warn(`FORCE ${name}: ${analysis.issues.map((i) => i.code).join(', ')}`);
  }

  const out = { title: doc.title, lyrics: analysis.converted };
  fs.mkdirSync(outAartiDir, { recursive: true });
  fs.writeFileSync(outPath, dumpBhajanDoc(out), 'utf8');

  const stLines = analysis.converted.sthayi
    ? analysis.converted.sthayi.split('\n').filter(Boolean).length
    : 0;
  console.log(`OK   ${name}: sthayi ${stLines} line(s), ${analysis.converted.paragraphs.length} paragraph(s)`);
  converted.push({ file: name, title: doc.title, stats: analysis.stats });
}

const report = {
  generatedAt: new Date().toISOString(),
  backupDir: backupAartiDir,
  converted,
  skipped,
};
fs.mkdirSync(outAartiDir, { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(`\nConverted: ${converted.length}  Skipped: ${skipped.length}  (manual/edit these)`);
if (skipped.length) {
  console.log(`Report: ${path.relative(process.cwd(), reportPath)}`);
}
if (skipped.length && !force) {
  process.exitCode = 1;
}
