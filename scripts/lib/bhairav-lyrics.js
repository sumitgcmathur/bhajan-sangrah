/**
 * Migration for content/bhairav — ambe shape logic with Bhairav-specific line cleanup.
 */
const { cleanLyricsText, isJunkLine } = require('./clean-lyrics');
const {
  extractTarzFromText,
  isStructuredLyrics,
  flattenLyricsText,
} = require('./lyrics-structure');
const {
  migrateAmbeLines,
  decodeHtmlEntities,
} = require('./ambe-lyrics');

/** Normalize scraped Bhairav markers before ambe shape detection. */
function preprocessBhairavLine(line) {
  let s = decodeHtmlEntities(line);
  s = s.replace(/।\s*टेर\s*।+/gi, '॥टेर॥');
  s = s.replace(/\|\|\s*([०-९0-9]+)\s*\|\|/gi, '॥$1॥');
  s = s.replace(/\s*\.{2,}\s*(?=॥\s*[०-९0-9])/g, ' ');
  if (/॥\s*[०-९0-9]/.test(s)) {
    s = s.replace(/\s*\.{2,}/g, ' ');
  }
  return s.replace(/\s+/g, ' ').trim();
}

function rawLines(text) {
  return String(text || '')
    .split('\n')
    .map((l) => preprocessBhairavLine(l))
    .filter((l) => l && !isJunkLine(l));
}

function migrateBhairavDoc(doc) {
  const out = { ...doc };
  delete out.jabani;

  const raw = isStructuredLyrics(doc.lyrics)
    ? flattenLyricsText(doc.lyrics)
    : String(doc.lyrics || '');

  const { tarz: embeddedTarz, rest } = extractTarzFromText(raw);
  if (embeddedTarz && !out.tarz) out.tarz = embeddedTarz;

  const lines = rawLines(cleanLyricsText(rest));
  if (!lines.length) {
    out.lyrics = { sthayi: '', paragraphs: [] };
    out._bhairavStrategy = 'empty';
    return out;
  }

  const { strategy, sthayi, paragraphs } = migrateAmbeLines(lines, out.title || doc.title || '');
  out.lyrics = {
    sthayi,
    paragraphs: paragraphs.filter(Boolean),
  };
  out._bhairavStrategy = strategy;
  return out;
}

module.exports = {
  migrateBhairavDoc,
  preprocessBhairavLine,
};
