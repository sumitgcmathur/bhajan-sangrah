#!/usr/bin/env node
/**
 * Regenerate romantitle on all bhajan YAML files from title.
 * Uses auto-transliteration; refine titles in admin as needed.
 */
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./lib/paths');
const { loadSections, sectionFolder, listBhajanFiles } = require('./lib/sections');
const { loadBhajanDoc, dumpBhajanDoc } = require('./lib/yaml-io');
const { devanagariToRoman } = require('./lib/devanagari-roman');

function main() {
  const config = loadSections();
  let updated = 0;

  for (const section of config.sections || []) {
    const folder = sectionFolder(section);
    for (const file of listBhajanFiles(section)) {
      const abs = path.join(folder, file);
      const doc = loadBhajanDoc(fs.readFileSync(abs, 'utf8'));
      doc.romantitle = devanagariToRoman(doc.title);
      fs.writeFileSync(abs, dumpBhajanDoc(doc), 'utf8');
      updated += 1;
    }
  }

  console.log(`Done: ${updated} romantitles refreshed`);
}

main();
