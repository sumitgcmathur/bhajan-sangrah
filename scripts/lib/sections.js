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

/**
 * Bhajan order on site: देवनागरी title order within each section.
 * Grouped sections (स्वरचित): group order unchanged; sort within each group in bhajansByGroup.
 */
function sortBhajansForDisplay(section, bhajans) {
  if (!bhajans?.length) return bhajans;
  if (section.grouped === true || section.grouped === 'true') return bhajans;
  return [...bhajans].sort(compareBhajanByTitle);
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

function countBhajansBySection(sections) {
  return sections.map((section) => ({
    slug: section.slug,
    count: listBhajanFiles(section).length,
  }));
}

module.exports = {
  compareHi,
  compareBhajanByTitle,
  sortBhajansForDisplay,
  loadSections,
  saveSections,
  sectionFolder,
  listBhajanFiles,
  loadBhajan,
  countBhajansBySection,
};