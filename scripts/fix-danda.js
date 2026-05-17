#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { loadSections, sectionFolder, listBhajanFiles, loadBhajan } = require('./lib/sections');
const { dumpBhajanDoc } = require('./lib/yaml-io');
const { normalizeLyricsText } = require('./lib/danda');
const { mapLyricsStrings, flattenLyricsText, isStructuredLyrics } = require('./lib/lyrics-structure');

let updated = 0;
let linesFixed = 0;

const config = loadSections();
for (const section of config.sections) {
  for (const file of listBhajanFiles(section)) {
    const fp = path.join(sectionFolder(section), file);
    const doc = loadBhajan(fp);
    const before = isStructuredLyrics(doc.lyrics) ? flattenLyricsText(doc.lyrics) : doc.lyrics || '';
    const next = mapLyricsStrings({ ...doc }, normalizeLyricsText);
    const after = isStructuredLyrics(next.lyrics) ? flattenLyricsText(next.lyrics) : next.lyrics || '';
    if (before !== after) {
      linesFixed += 1;
      fs.writeFileSync(fp, dumpBhajanDoc(next), 'utf8');
      updated += 1;
    }
  }
}

console.log(`Updated ${updated} files, ${linesFixed} files normalized.`);
