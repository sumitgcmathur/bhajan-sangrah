/**
 * Hanuman Chalisa — doha sthayi + chaupai couplets grouped by verse markers (॥४, ॥८, …).
 */
const { cleanLyricsText, isJunkLine } = require('./clean-lyrics');
const {
  extractTarzFromText,
  isStructuredLyrics,
  flattenLyricsText,
} = require('./lyrics-structure');
const { cleanAmbeLine, decodeHtmlEntities } = require('./ambe-lyrics');

const DOHA_MARKER_RE = /^॥\s*दोहा\s*॥?/i;
const CHAUPAI_MARKER_RE = /^॥\s*चौपाई\s*॥?/i;
const STANZA_END_RE = /॥\s*[०-९0-9]+\s*$/u;

function preprocessLine(line) {
  return decodeHtmlEntities(String(line || ''))
    .replace(/\|\|/g, '॥')
    .replace(/\s+/g, ' ')
    .trim();
}

function rawLines(text) {
  return String(text || '')
    .split('\n')
    .map(preprocessLine)
    .filter((l) => l && !isJunkLine(l));
}

function isSectionMarker(line) {
  return DOHA_MARKER_RE.test(line) || CHAUPAI_MARKER_RE.test(line);
}

function endsChaupaiStanza(line) {
  return STANZA_END_RE.test(String(line || '').trim());
}

function joinHalfLines(a, b) {
  const left = String(a || '')
    .replace(/[।॥]\s*$/, '')
    .trim();
  if (!b) return cleanChaupaiLine(a);
  const right = cleanChaupaiLine(b);
  if (left.endsWith(',')) return `${left} ${right}`;
  return `${left}, ${right}`;
}

function cleanChaupaiLine(line) {
  const hadStanza = STANZA_END_RE.test(String(line || ''));
  let s = cleanAmbeLine(line);
  if (hadStanza && !/॥\s*$/.test(s)) s += '॥';
  return s;
}

function formatCoupletRuns(lines, joinSep = '\n\n') {
  const rows = [];
  for (let i = 0; i < lines.length; i += 2) {
    rows.push(joinHalfLines(cleanChaupaiLine(lines[i]), lines[i + 1] ? lines[i + 1] : ''));
  }
  return rows.join(joinSep);
}

function formatDohaStahyi(lines) {
  const blocks = [];
  for (let i = 0; i < lines.length; i += 4) {
    blocks.push(formatCoupletRuns(lines.slice(i, i + 4), '\n'));
  }
  return blocks.join('\n\n');
}

/** Ends with ॥ (couplet close); may include an unnumbered ॥. */
function endsChaupaiCouplet(line) {
  const t = String(line || '').trim();
  return /॥\s*$/u.test(t) && !STANZA_END_RE.test(t);
}

function stanzaBreakAhead(lines, fromIdx, lookAhead = 4) {
  for (let j = fromIdx + 1; j < Math.min(lines.length, fromIdx + 1 + lookAhead); j += 1) {
    if (endsChaupaiStanza(lines[j])) return true;
  }
  return false;
}

function migrateChalisaLines(lines) {
  let i = 0;
  while (i < lines.length && !DOHA_MARKER_RE.test(lines[i])) i += 1;
  if (i < lines.length) i += 1;

  const openingDoha = [];
  while (i < lines.length && !CHAUPAI_MARKER_RE.test(lines[i])) {
    if (!isSectionMarker(lines[i])) openingDoha.push(lines[i]);
    i += 1;
  }

  let chaupaiMarker = null;
  if (i < lines.length && CHAUPAI_MARKER_RE.test(lines[i])) {
    chaupaiMarker = cleanAmbeLine(lines[i]);
    i += 1;
  }

  const chaupaiLines = [];
  const closingDoha = [];
  let inClosing = false;

  for (; i < lines.length; i += 1) {
    if (DOHA_MARKER_RE.test(lines[i])) {
      inClosing = true;
      continue;
    }
    if (inClosing) closingDoha.push(lines[i]);
    else if (!isSectionMarker(lines[i])) chaupaiLines.push(lines[i]);
  }

  const paragraphs = [];
  let buf = [];
  for (let i = 0; i < chaupaiLines.length; i += 1) {
    const line = chaupaiLines[i];
    buf.push(line);
    if (endsChaupaiStanza(line)) {
      paragraphs.push(formatCoupletRuns(buf));
      buf = [];
    } else if (
      buf.length === 2 &&
      endsChaupaiCouplet(line) &&
      !stanzaBreakAhead(chaupaiLines, i, 4)
    ) {
      paragraphs.push(formatCoupletRuns(buf));
      buf = [];
    }
  }
  if (buf.length) paragraphs.push(formatCoupletRuns(buf));

  if (chaupaiMarker && paragraphs.length) {
    paragraphs[0] = `${chaupaiMarker}\n${paragraphs[0]}`;
  } else if (chaupaiMarker) {
    paragraphs.unshift(chaupaiMarker);
  }

  if (closingDoha.length) {
    paragraphs.push(formatCoupletRuns(closingDoha, '\n'));
  }

  return {
    strategy: 'chalisa',
    sthayi: formatDohaStahyi(openingDoha),
    paragraphs,
  };
}

function migrateChalisaDoc(doc) {
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
    out._chalisaStrategy = 'empty';
    return out;
  }

  const { strategy, sthayi, paragraphs } = migrateChalisaLines(lines);
  out.lyrics = {
    sthayi,
    paragraphs: paragraphs.filter(Boolean),
  };
  out._chalisaStrategy = strategy;
  return out;
}

module.exports = {
  migrateChalisaDoc,
  migrateChalisaLines,
};
