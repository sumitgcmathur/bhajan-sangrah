#!/usr/bin/env node
/**
 * Apply changes exported from the spellcheck web UI.
 * Usage: node scripts/apply-spellcheck-changes.js path/to/spellcheck-changes.json
 */
const fs = require('fs');
const path = require('path');
const { applyDictionaryAdditions, applyReplacements } = require('./lib/spellcheck-core');

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node scripts/apply-spellcheck-changes.js <spellcheck-changes.json>');
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  const dictAdds = payload.dictionaryAdd || [];
  const replacements = payload.replacements || [];

  if (!dictAdds.length && !replacements.length) {
    console.log('Nothing to apply.');
    return;
  }

  if (dictAdds.length) {
    const n = applyDictionaryAdditions(dictAdds);
    console.log(`Dictionary: added ${n} word(s).`);
  }

  if (replacements.length) {
    const { filesTouched, totalHits } = applyReplacements(replacements);
    console.log(`Replacements: ~${totalHits} token hit(s) across ${filesTouched} file(s).`);
    for (const r of replacements) {
      console.log(`  "${r.from}" → "${r.to}"`);
    }
  }

  console.log('\nRe-run: node scripts/build.js');
}

main();
