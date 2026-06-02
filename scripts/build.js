#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { ROOT, DOCS, ASSETS } = require('./lib/paths');
const {
  loadSections,
  sectionFolder,
  listBhajanFiles,
  loadBhajan,
  countBhajansBySection,
} = require('./lib/sections');
const { enrichBhajanLyrics } = require('./lib/lyrics-structure');
const { renderIndex, renderSectionPage, pageUrl } = require('./lib/template');
const { anchorId } = require('./lib/slug');
const { buildSearchIndex, writeSearchIndex } = require('./lib/search-index');
const { warnMissingThumbs } = require('./lib/banner-thumbs');
const { writePwaArtifacts } = require('./lib/pwa');

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

async function main() {
  const config = loadSections();
  const base = config.base_url || '/';
  const sections = config.sections || [];
  const sectionCounts = countBhajansBySection(sections);

  warnMissingThumbs(config);

  if (fs.existsSync(DOCS)) rmDir(DOCS);
  fs.mkdirSync(DOCS, { recursive: true });
  fs.writeFileSync(path.join(DOCS, '.nojekyll'), '', 'utf8');
  // gh-pages is GitHub Pages only; Vercel reads vercel.json from the branch being deployed.
  fs.writeFileSync(
    path.join(DOCS, 'vercel.json'),
    `${JSON.stringify({ git: { deploymentEnabled: false } }, null, 2)}\n`,
    'utf8'
  );

  copyDir(path.join(ASSETS), path.join(DOCS, 'assets'));
  await writePwaArtifacts(DOCS, config, base);

  fs.writeFileSync(
    path.join(DOCS, 'index.html'),
    renderIndex(config, sections, base, sectionCounts),
    'utf8'
  );

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
      group: b.group,
      swarachit: b.swarachit,
      lyrics: enrichBhajanLyrics(b.lyrics, section, b, config),
      jabani: b.jabani,
      id: b.id || anchorId(section.slug, b.title, i),
    }));
    fs.writeFileSync(
      path.join(DOCS, `${section.slug}.html`),
      renderSectionPage(section, enriched, config, sections, base, sectionCounts),
      'utf8'
    );
    total += enriched.length;
    console.log(`${section.slug}: ${enriched.length} bhajans`);
  }

  const searchItems = buildSearchIndex(sections, base);
  writeSearchIndex(path.join(DOCS, 'assets', 'search-index.json'), searchItems);

  console.log(`Built ${sections.length} sections, ${total} bhajans → ${DOCS}`);
  console.log(`Search index: ${searchItems.length} entries`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});