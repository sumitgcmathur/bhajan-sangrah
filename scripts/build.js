#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { ROOT, DOCS, ASSETS } = require('./lib/paths');
const { loadSections, isBhajanSection } = require('./lib/sections');
const { buildSectionBhajanMap, countBhajansBySection } = require('./lib/cross-section');
const { prepareBhajanForRender } = require('./lib/bhajan-render');
const { renderIndex, renderSectionPage, pageUrl } = require('./lib/template');
const { buildSearchIndex, writeSearchIndex } = require('./lib/search-index');
const { warnMissingThumbs } = require('./lib/banner-thumbs');
const { writePwaArtifacts } = require('./lib/pwa');
const {
  validateAllBhajans,
  printSchemaWarnings,
  writeSchemaReport,
} = require('./lib/bhajan-schema');
const { writeCorpusDictionary } = require('./lib/corpus-dictionary');
const { writeSanskritDictionary } = require('./lib/sanskrit-dictionary');

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
  const { bySlug, records, uniqueCount } = buildSectionBhajanMap(sections);
  const sectionCounts = countBhajansBySection(sections, bySlug);

  const schemaIssues = validateAllBhajans(config);
  printSchemaWarnings(schemaIssues, { githubActions: process.env.GITHUB_ACTIONS === 'true' });
  const schemaReport = writeSchemaReport(schemaIssues);
  if (schemaIssues.length) console.log(`Schema report: ${schemaReport}`);

  writeCorpusDictionary(config);
  await writeSanskritDictionary();

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

  let total = 0;
  const allBhajanEntries = [];
  for (const section of sections) {
    const rawBhajans = bySlug.get(section.slug) || [];
    const enriched = rawBhajans.map((b, i) => {
      const { _file, _filePath, _primarySection, _isCrossListed, ...doc } = b;
      const prepared = prepareBhajanForRender(doc, section, config, { index: i });
      return {
        ...prepared,
        _isCrossListed: Boolean(_isCrossListed),
        _primarySection: _primarySection || section,
      };
    });
    for (const bhajan of enriched) {
      const primary = bhajan._primarySection || section;
      if (!bhajan._isCrossListed && isBhajanSection(primary)) {
        allBhajanEntries.push({ bhajan, section: primary });
      }
    }
    fs.writeFileSync(
      path.join(DOCS, `${section.slug}.html`),
      renderSectionPage(section, enriched, config, sections, base, sectionCounts, uniqueCount),
      'utf8'
    );
    total += enriched.length;
    console.log(`${section.slug}: ${enriched.length} bhajans`);
  }

  fs.writeFileSync(
    path.join(DOCS, 'index.html'),
    renderIndex(config, sections, base, sectionCounts, allBhajanEntries, uniqueCount),
    'utf8'
  );

  const searchItems = buildSearchIndex(sections, base, bySlug, records);
  writeSearchIndex(path.join(DOCS, 'assets', 'search-index.json'), searchItems);

  console.log(`Built ${sections.length} sections, ${uniqueCount} bhajans (${total} section listings) → ${DOCS}`);
  console.log(`Search index: ${searchItems.length} entries`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});