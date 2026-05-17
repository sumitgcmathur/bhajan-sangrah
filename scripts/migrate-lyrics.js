#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { CONTENT } = require('./lib/paths');
const { loadBhajanDoc, dumpBhajanDoc } = require('./lib/yaml-io');
const { migrateDoc, isStructuredLyrics } = require('./lib/lyrics-structure');

function walkYamlFiles(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) {
      if (name === 'content-backup' || name.startsWith('content-backup-')) continue;
      walkYamlFiles(p, out);
    } else if ((name.endsWith('.yaml') || name.endsWith('.yml')) && name !== 'sections.yaml') {
      out.push(p);
    }
  }
  return out;
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const files = walkYamlFiles(CONTENT).filter(
    (f) => !f.includes('lyrics-migration-report')
  );
  let migrated = 0;
  let skipped = 0;

  for (const fp of files.sort()) {
    const raw = fs.readFileSync(fp, 'utf8');
    const doc = loadBhajanDoc(raw);
    if (!doc.title) continue;
    if (isStructuredLyrics(doc.lyrics)) {
      skipped += 1;
      continue;
    }
    const next = migrateDoc(doc);
    if (!dryRun) {
      fs.writeFileSync(fp, dumpBhajanDoc(next), 'utf8');
    }
    migrated += 1;
  }

  console.log(
    dryRun
      ? `Would migrate ${migrated} files (${skipped} already structured)`
      : `Migrated ${migrated} files (${skipped} already structured)`
  );
}

main();
