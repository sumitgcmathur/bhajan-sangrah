const fs = require('fs');
const path = require('path');
const { SECTIONS_FILE, CONTENT } = require('./paths');
const { loadSectionsDoc, dumpSectionsDoc, loadBhajanDoc } = require('./yaml-io');

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

module.exports = {
  loadSections,
  saveSections,
  sectionFolder,
  listBhajanFiles,
  loadBhajan,
};