#!/usr/bin/env node
/**
 * Add romantitle to all bhajan YAML files that lack it.
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
  let skipped = 0;

  for (const section of config.sections || []) {
    const folder = sectionFolder(section);
    for (const file of listBhajanFiles(section)) {
      const abs = path.join(folder, file);
      const text = fs.readFileSync(abs, 'utf8');
      const doc = loadBhajanDoc(text);
      if (doc.romantitle && String(doc.romantitle).trim()) {
        skipped += 1;
        continue;
      }
      doc.romantitle = devanagariToRoman(doc.title);
      fs.writeFileSync(abs, dumpBhajanDoc(doc), 'utf8');
      updated += 1;
      console.log(`  ${path.relative(ROOT, abs).replace(/\\/g, '/')}`);
    }
  }

  console.log(`\nDone: ${updated} updated, ${skipped} already had romantitle`);
}

main();
