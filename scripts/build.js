#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { DOCS, ASSETS } = require('./lib/paths');
const { loadSections, sectionFolder, listBhajanFiles, loadBhajan } = require('./lib/sections');
const { renderIndex, renderSectionPage } = require('./lib/template');
const { anchorId } = require('./lib/slug');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function rmDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) rmDir(p);
    else fs.unlinkSync(p);
  }
  fs.rmdirSync(dir);
}

function main() {
  const config = loadSections();
  const base = config.base_url || '/';
  const sections = config.sections || [];

  if (fs.existsSync(DOCS)) rmDir(DOCS);
  fs.mkdirSync(DOCS, { recursive: true });
  fs.writeFileSync(path.join(DOCS, '.nojekyll'), '', 'utf8');

  copyDir(path.join(ASSETS), path.join(DOCS, 'assets'));

  fs.writeFileSync(path.join(DOCS, 'index.html'), renderIndex(config, sections, base), 'utf8');

  let total = 0;
  for (const section of sections) {
    const files = listBhajanFiles(section);
    const bhajans = files.map((f) => {
      const data = loadBhajan(path.join(sectionFolder(section), f));
      return { ...data, _file: f };
    });
    const enriched = bhajans.map((b, i) => ({
      title: b.title,
      tarz: b.tarz,
      swarachit: b.swarachit,
      lyrics: b.lyrics,
      id: b.id || anchorId(section.slug, b.title, i),
    }));
    fs.writeFileSync(
      path.join(DOCS, `${section.slug}.html`),
      renderSectionPage(section, enriched, config, sections, base),
      'utf8'
    );
    total += enriched.length;
    console.log(`${section.slug}: ${enriched.length} bhajans`);
  }

  console.log(`Built ${sections.length} sections, ${total} bhajans → ${DOCS}`);
}

main();