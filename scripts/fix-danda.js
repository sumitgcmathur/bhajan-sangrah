#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { loadSections, sectionFolder, listBhajanFiles, loadBhajan } = require('./lib/sections');
const { dumpBhajanDoc } = require('./lib/yaml-io');
const { normalizeLyricsText } = require('./lib/danda');

let updated = 0;
let linesFixed = 0;

const config = loadSections();
for (const section of config.sections) {
  for (const file of listBhajanFiles(section)) {
    const fp = path.join(sectionFolder(section), file);
    const doc = loadBhajan(fp);
    const before = doc.lyrics || '';
    const after = normalizeLyricsText(before);
    if (before !== after) {
      const beforeLines = before.split('\n');
      const afterLines = after.split('\n');
      for (let i = 0; i < beforeLines.length; i++) {
        if (beforeLines[i] !== afterLines[i]) linesFixed += 1;
      }
      doc.lyrics = after;
      fs.writeFileSync(fp, dumpBhajanDoc(doc), 'utf8');
      updated += 1;
    }
  }
}

console.log(`Updated ${updated} files, ${linesFixed} lines normalized.`);
