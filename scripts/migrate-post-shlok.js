#!/usr/bin/env node
/** Rewrite bhajan YAML: dhvani / shlok / jabani → lyrics.post_shlok */
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./lib/paths');
const { loadSections, sectionFolder, listBhajanFiles } = require('./lib/sections');
const { loadBhajanDoc, dumpBhajanDoc } = require('./lib/yaml-io');

function main() {
  const config = loadSections();
  let updated = 0;

  for (const section of config.sections || []) {
    for (const file of listBhajanFiles(section)) {
      const abs = path.join(sectionFolder(section), file);
      const before = fs.readFileSync(abs, 'utf8');
      const doc = loadBhajanDoc(before);
      const after = dumpBhajanDoc(doc);
      if (after !== before) {
        fs.writeFileSync(abs, after, 'utf8');
        updated += 1;
        console.log(path.relative(ROOT, abs).replace(/\\/g, '/'));
      }
    }
  }

  console.log(`Migrated ${updated} file(s) to post_shlok.`);
}

main();
