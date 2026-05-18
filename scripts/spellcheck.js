#!/usr/bin/env node
const { collectSpellcheckData } = require('./lib/spellcheck-core');

function main() {
  const { tokenCount, unknown } = collectSpellcheckData();

  if (!unknown.length) {
    console.log(`OK — ${tokenCount} tokens`);
    return;
  }

  console.log(`Possible typos (${unknown.length} unknown words):\n`);
  for (const item of unknown) {
    const sample = item.refs
      .slice(0, 3)
      .map((r) => r.path)
      .join(', ');
    console.log(`  ${item.word}  ← ${sample}`);
  }
  console.log(`\nAdd valid words to dictionary.txt, or run: node scripts/spellcheck-ui.js`);
  process.exit(1);
}

main();
