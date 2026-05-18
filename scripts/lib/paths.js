const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CONTENT = path.join(ROOT, 'content');
const SECTIONS_FILE = path.join(CONTENT, 'sections.yaml');
const DOCS = path.join(ROOT, 'docs');
const ASSETS = path.join(ROOT, 'assets');

module.exports = {
  ROOT,
  CONTENT,
  SECTIONS_FILE,
  DOCS,
  ASSETS,
};
