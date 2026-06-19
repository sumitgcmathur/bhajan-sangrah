const fs = require('fs');
const path = require('path');
const { SECTIONS_FILE, CONTENT } = require('./paths');
const { loadSectionsDoc, dumpSectionsDoc, loadBhajanDoc } = require('./yaml-io');

function compareHi(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'hi');
}

function compareBhajanByTitle(a, b) {
  return compareHi(a.title, b.title);
}

/** `file` = YAML filename order; `title` = देवनागरी title order (default). */
function sectionBhajanOrder(section) {
  const v = String(section?.bhajan_order || '')
    .trim()
    .toLowerCase();
  if (v === 'file' || v === 'filename') return 'file';
  return 'title';
}

function isGroupedSection(section) {
  return section?.grouped === true || section?.grouped === 'true';
}

/** Sections whose items are omitted from site-wide bhajan totals (rare; most sections count). */
function excludeFromBhajanCount(section) {
  return section?.exclude_from_bhajan_count === true || section?.exclude_from_bhajan_count === 'true';
}

function isBhajanSection(section) {
  return !excludeFromBhajanCount(section);
}

/** Label for per-section item counts in UI (default: भजन). */
function sectionCountUnit(section) {
  const unit = String(section?.count_unit || '').trim();
  return unit || 'भजन';
}

/**
 * Bhajan index order for site + admin list.
 * Grouped sections (स्वरचित): group order from files; within-group sort in bhajansByGroup when title.
 */
function sortBhajansForDisplay(section, bhajans) {
  if (!bhajans?.length) return bhajans;
  if (sectionBhajanOrder(section) === 'file') return bhajans;
  if (isGroupedSection(section)) return bhajans;
  return [...bhajans].sort(compareBhajanByTitle);
}

/** All bhajans across sections for the landing-page master index (always title order). */
function sortAllBhajansByTitle(entries) {
  if (!entries?.length) return entries;
  return [...entries].sort(compareBhajanByTitle);
}

function loadSections() {
  const raw = fs.readFileSync(SECTIONS_FILE, 'utf8');
  const body = raw
    .split('\n')
    .filter((l) => !l.trim().startsWith('#'))
    .join('\n');
  return loadSectionsDoc(body);
}

function saveSections(config) {
  const header = '# Master section index — edit via add-section.js or directly\n';
  fs.writeFileSync(SECTIONS_FILE, header + dumpSectionsDoc(config), 'utf8');
}

function sectionFolder(section) {
  return path.join(CONTENT, section.folder);
}

function listBhajanFiles(section) {
  const dir = sectionFolder(section);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .sort((a, b) => a.localeCompare(b, 'hi'));
}

function loadBhajan(filePath) {
  return loadBhajanDoc(fs.readFileSync(filePath, 'utf8'));
}

/** File count per folder only — prefer cross-section.countBhajansBySection for site stats. */
function countBhajansBySectionFiles(sections) {
  return sections.map((section) => ({
    slug: section.slug,
    count: listBhajanFiles(section).length,
  }));
}

module.exports = {
  compareHi,
  compareBhajanByTitle,
  sectionBhajanOrder,
  isGroupedSection,
  excludeFromBhajanCount,
  isBhajanSection,
  sectionCountUnit,
  sortBhajansForDisplay,
  sortAllBhajansByTitle,
  loadSections,
  saveSections,
  sectionFolder,
  listBhajanFiles,
  loadBhajan,
  countBhajansBySectionFiles,
};