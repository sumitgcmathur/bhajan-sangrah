#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { loadSections, sectionFolder, listBhajanFiles } = require('./lib/sections');
const { bhajanFilename } = require('./lib/slug');
const { dumpBhajanDoc } = require('./lib/yaml-io');

function ask(rl, q) {
  return new Promise((resolve) => rl.question(q, resolve));
}

async function readMultiline(rl) {
  console.log('Lyrics (blank line to finish):');
  const lines = [];
  while (true) {
    const line = await ask(rl, '');
    if (line === '') break;
    lines.push(line);
  }
  return lines.join('\n');
}

async function main() {
  const config = loadSections();
  const sections = config.sections || [];
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\nSections:');
  sections.forEach((s, i) => console.log(`  ${i + 1}. ${s.title} (${s.slug})`));
  const idx = parseInt(await ask(rl, '\nSection number: '), 10) - 1;
  const section = sections[idx];
  if (!section) {
    console.error('Invalid section');
    rl.close();
    process.exit(1);
  }

  const title = (await ask(rl, 'Title: ')).trim();
  const tarz = (await ask(rl, 'लय (optional): ')).trim();
  const sw = (await ask(rl, 'Swarachit? (y/N): ')).trim().toLowerCase();
  const alsoRaw = (await ask(rl, 'Also list in sections (comma slugs, optional): ')).trim();
  const lyrics = await readMultiline(rl);

  const dir = sectionFolder(section);
  fs.mkdirSync(dir, { recursive: true });
  const existing = new Set(listBhajanFiles(section));
  const filename = bhajanFilename(title, existing.size, existing);

  const doc = { title, lyrics };
  if (tarz) doc.tarz = tarz;
  if (sw === 'y' || sw === 'yes') doc.swarachit = true;
  if (alsoRaw) {
    doc.also_in = alsoRaw.split(',').map((s) => s.trim()).filter(Boolean);
  }

  fs.writeFileSync(path.join(dir, filename), dumpBhajanDoc(doc), 'utf8');
  console.log(`\nWrote content/${section.folder}/${filename}`);
  rl.close();
}

main();