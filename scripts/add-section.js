#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { loadSections, saveSections, sectionFolder } = require('./lib/sections');

function ask(rl, q) {
  return new Promise((resolve) => rl.question(q, resolve));
}

async function main() {
  const config = loadSections();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const slug = (await ask(rl, 'URL slug (e.g. sant): ')).trim().toLowerCase();
  const folder = (await ask(rl, `Content folder [${slug}]: `)).trim() || slug;
  const title = (await ask(rl, 'Section title (Hindi): ')).trim();
  const google_path = (await ask(rl, 'Google path (if migrating) [slug]: ')).trim() || slug;

  if (config.sections.some((s) => s.slug === slug)) {
    console.error('Section slug already exists');
    rl.close();
    process.exit(1);
  }

  const section = {
    slug,
    folder,
    google_path,
    title,
    banner: `assets/banners/${slug}.jpg`,
  };

  config.sections.push(section);
  saveSections(config);
  fs.mkdirSync(sectionFolder(section), { recursive: true });

  console.log(`\nAdded section "${title}" → content/${folder}/`);
  console.log(`Place banner at assets/banners/${slug}.jpg`);
  console.log('Run: npm run build');
  rl.close();
}

main();