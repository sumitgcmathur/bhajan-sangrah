#!/usr/bin/env node
/**
 * Re-migrate hanuman 003–006 from backup. Does not touch Chalisa (001) or Ashtak (002).
 *
 *   node scripts/migrate-hanuman-003-006-from-backup.js
 *   node scripts/migrate-hanuman-003-006-from-backup.js content-backup-20260517-123521
 */
const fs = require('fs');
const path = require('path');
const { CONTENT } = require('./lib/paths');
const { loadBhajanDoc, dumpBhajanDoc } = require('./lib/yaml-io');
const { migrateSectionDoc } = require('./lib/section-lyrics');

const PREFIXES = ['003-', '004-', '005-', '006-'];
const backupRoot = process.argv[2] || 'content-backup-20260517-123521';
const backupDir = path.join(path.dirname(CONTENT), path.basename(backupRoot), 'hanuman');
const outDir = path.join(CONTENT, 'hanuman');

if (!fs.existsSync(backupDir)) {
  console.error(`Backup not found: ${backupDir}`);
  process.exit(1);
}

const files = fs
  .readdirSync(backupDir)
  .filter((n) => n.endsWith('.yaml') && PREFIXES.some((p) => n.startsWith(p)))
  .sort();

if (!files.length) {
  console.error('No 003–006 backup files found.');
  process.exit(1);
}

for (const name of files) {
  const doc = loadBhajanDoc(fs.readFileSync(path.join(backupDir, name), 'utf8'));
  const migrated = migrateSectionDoc({ ...doc });
  const strategy = migrated._sectionStrategy;
  delete migrated._sectionStrategy;
  fs.writeFileSync(path.join(outDir, name), dumpBhajanDoc(migrated), 'utf8');
  const paras = migrated.lyrics?.paragraphs?.length ?? 0;
  console.log(`Wrote ${name} (strategy: ${strategy}, ¶: ${paras})`);
}
