#!/usr/bin/env node
/**
 * Re-migrate only Hanuman Chalisa from backup (other hanuman/*.yaml untouched).
 *
 *   node scripts/migrate-hanuman-chalisa-from-backup.js
 */
const fs = require('fs');
const path = require('path');
const { CONTENT } = require('./lib/paths');
const { loadBhajanDoc, dumpBhajanDoc } = require('./lib/yaml-io');
const { migrateChalisaDoc } = require('./lib/chalisa-lyrics');

const FILE = '001-हनुमान-चालीसा.yaml';
const backupRoot = process.argv[2] || 'content-backup-20260517-123521';
const backupPath = path.join(path.dirname(CONTENT), path.basename(backupRoot), 'hanuman', FILE);
const targetPath = path.join(CONTENT, 'hanuman', FILE);

if (!fs.existsSync(backupPath)) {
  console.error(`Backup not found: ${backupPath}`);
  process.exit(1);
}

const doc = loadBhajanDoc(fs.readFileSync(backupPath, 'utf8'));
const migrated = migrateChalisaDoc(doc);
const strategy = migrated._chalisaStrategy;
delete migrated._chalisaStrategy;

fs.writeFileSync(targetPath, dumpBhajanDoc(migrated), 'utf8');
console.log(`Wrote ${targetPath} (strategy: ${strategy}, ¶: ${migrated.lyrics.paragraphs.length})`);
