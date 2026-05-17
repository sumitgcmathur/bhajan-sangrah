#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { DICTIONARY, CONTENT } = require('./lib/paths');
const { loadSections, sectionFolder, listBhajanFiles, loadBhajan } = require('./lib/sections');

function loadDictionary() {
  if (!fs.existsSync(DICTIONARY)) return new Set();
  return new Set(
    fs
      .readFileSync(DICTIONARY, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
  );
}

function tokenize(text) {
  return String(text)
    .replace(/[।॥,\.;:!?'"()\[\]{}«»—–\-0-9]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1);
}

function main() {
  const dict = loadDictionary();
  const config = loadSections();
  const unknown = new Map();
  let words = 0;

  for (const section of config.sections) {
    for (const file of listBhajanFiles(section)) {
      const data = loadBhajan(path.join(sectionFolder(section), file));
      const text = [data.title, data.tarz, data.lyrics].filter(Boolean).join('\n');
      for (const word of tokenize(text)) {
        words += 1;
        if (!dict.has(word)) {
          const key = word;
          if (!unknown.has(key)) unknown.set(key, []);
          unknown.get(key).push(`${section.slug}/${file}`);
        }
      }
    }
  }

  if (!unknown.size) {
    console.log(`OK — ${words} tokens, dictionary has ${dict.size} words`);
    return;
  }

  console.log(`Possible typos (${unknown.size} unknown words):\n`);
  for (const [word, files] of [...unknown.entries()].sort((a, b) => a[0].localeCompare(b[0], 'hi'))) {
    const sample = [...new Set(files)].slice(0, 3).join(', ');
    console.log(`  ${word}  ← ${sample}`);
  }
  console.log(`\nAdd valid words to dictionary.txt (one per line).`);
  process.exit(1);
}

main();