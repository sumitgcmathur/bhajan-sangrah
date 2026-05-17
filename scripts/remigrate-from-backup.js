#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { CONTENT } = require('./lib/paths');
const { loadBhajanDoc, dumpBhajanDoc } = require('./lib/yaml-io');
const { migrateDoc } = require('./lib/lyrics-structure');

const backupRoot = process.argv[2] || 'content-backup-20260517-123521';
const backupDir = path.join(path.dirname(CONTENT), path.basename(backupRoot));

if (!fs.existsSync(backupDir)) {
  console.error(`Backup not found: ${backupDir}`);
  process.exit(1);
}

function walk(dir, base, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, base, out);
    else if (name.endsWith('.yaml') && name !== 'sections.yaml') {
      out.push({ backup: p, target: path.join(CONTENT, path.relative(base, p)) });
    }
  }
  return out;
}

const pairs = walk(backupDir, backupDir);
let n = 0;
for (const { backup, target } of pairs) {
  if (backup.includes('lyrics-migration-report')) continue;
  const doc = loadBhajanDoc(fs.readFileSync(backup, 'utf8'));
  const migrated = migrateDoc(doc);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, dumpBhajanDoc(migrated), 'utf8');
  n += 1;
}
console.log(`Re-migrated ${n} files from ${backupDir}`);
