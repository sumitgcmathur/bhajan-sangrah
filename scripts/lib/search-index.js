const fs = require('fs');
const path = require('path');
const { sectionFolder, listBhajanFiles, loadBhajan } = require('./sections');
const { anchorId } = require('./slug');

function pageUrl(base, page) {
  if (!page) return base || './';
  return `${base || './'}${page}`;
}

function buildSearchIndex(sections, base) {
  const items = [];
  for (const section of sections) {
    const files = listBhajanFiles(section);
    files.forEach((f, i) => {
      const b = loadBhajan(path.join(sectionFolder(section), f));
      const id = b.id || anchorId(section.slug, b.title, i);
      items.push({
        title: b.title,
        section: section.title,
        slug: section.slug,
        id,
        href: `${pageUrl(base, `${section.slug}.html`)}#${encodeURIComponent(id)}`,
      });
    });
  }
  return items;
}

function writeSearchIndex(destPath, items) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, JSON.stringify(items), 'utf8');
}

module.exports = { buildSearchIndex, writeSearchIndex };
