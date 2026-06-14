const fs = require('fs');
const path = require('path');
const { sectionFolder, listBhajanFiles, loadBhajan, sortBhajansForDisplay } = require('./sections');
const { anchorId } = require('./slug');

function pageUrl(base, page) {
  if (!page) return base || './';
  return `${base || './'}${page}`;
}

function collectLyricsText(lyrics) {
  if (!lyrics) return '';
  if (typeof lyrics === 'string') return lyrics;

  const chunks = [];
  const addPart = (p) => {
    if (!p) return;
    if (p.pre_shlok) chunks.push(String(p.pre_shlok));
    if (p.sthayi) chunks.push(String(p.sthayi));
    for (const para of p.paragraphs || []) {
      if (para && typeof para === 'object' && para.commentary != null) {
        chunks.push(String(para.commentary));
        continue;
      }
      const body = String(para).trim();
      if (body) chunks.push(body);
    }
    if (p.post_shlok) chunks.push(String(p.post_shlok));
  };

  if (Array.isArray(lyrics.parts)) {
    for (const p of lyrics.parts) addPart(p);
  } else {
    addPart(lyrics);
  }
  return chunks.join('\n');
}

/** Searchable lyric lines (one per physical line, markers stripped lightly). */
function collectLyricLines(b) {
  const raw = [b.tarz, collectLyricsText(b.lyrics)].filter(Boolean).join('\n');
  return raw
    .split('\n')
    .map((line) => line.replace(/\s*॥[^॥]*॥\s*$/u, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function buildSearchIndex(sections, base) {
  const items = [];
  for (const section of sections) {
    const files = listBhajanFiles(section);
    const bhajans = files.map((f) => loadBhajan(path.join(sectionFolder(section), f)));
    const sorted = sortBhajansForDisplay(section, bhajans);
    sorted.forEach((b, i) => {
      const id = b.id || anchorId(section.slug, b.title, i);
      items.push({
        title: b.title || '',
        section: section.title,
        slug: section.slug,
        id,
        lines: collectLyricLines(b),
        href: `${pageUrl(base, `${section.slug}.html`)}#${id}`,
      });
    });
  }
  return items;
}

function writeSearchIndex(destPath, items) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, JSON.stringify(items), 'utf8');
}

module.exports = { buildSearchIndex, writeSearchIndex, collectLyricsText, collectLyricLines };
