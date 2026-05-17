#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { CONTENT } = require('./lib/paths');
const { loadSections, sectionFolder, listBhajanFiles, loadBhajan } = require('./lib/sections');
const { dumpBhajanDoc } = require('./lib/yaml-io');
const { cleanBhajanDoc } = require('./lib/clean-lyrics');

let fixed = 0;
const config = loadSections();
for (const section of config.sections) {
  for (const file of listBhajanFiles(section)) {
    const fp = path.join(sectionFolder(section), file);
    const raw = loadBhajan(fp);
    const cleaned = cleanBhajanDoc(raw);
    const before = raw.lyrics || '';
    const after = cleaned.lyrics || '';
    if (before !== after) {
      fs.writeFileSync(fp, dumpBhajanDoc(cleaned), 'utf8');
      fixed += 1;
      console.log(`cleaned ${section.slug}/${file}`);
    }
  }
}
console.log(`Done. ${fixed} file(s) updated.`);