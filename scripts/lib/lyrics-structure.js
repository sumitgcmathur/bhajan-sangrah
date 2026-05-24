const { cleanLyricsText, isJunkLine } = require('./clean-lyrics');

const HEADING_RE =
  /^(अम्बे|अंबे|गणपति|विविध|शिव|राम|कृष्ण|हनुमान|होरिया|आरती|मूल\s*तत्त्व|स्वरचित).{0,24}(भजन|गान)$/i;

const DEVA_DIGITS = '०१२३४५६७८९';
const END_MARKER_RE = /(?:\s*(\|\|\s*[^|]+\s*\|\|)|(\s*॥+))\s*$/u;
/** Trailing verse numbers / टेर — not a plain closing ॥ on the line */
const VERSE_TAIL_RE =
  /(?:\s*\|\|\s*[^|]+\s*\|\||\s*॥+[०-९0-9]+॥*|\s*।\s*[०-९0-9]+\s*।?|\s*[।॥]\s*[०-९0-9]+\s*(?:टेर|तेर)?\s*[।॥]?)\s*$/u;
const TARZ_LINE_RE = /^(?:तर्ज|राग)\s*[:：\-]\s*(.+)$/i;

function isHeadingLine(line) {
  const t = String(line || '').trim();
  if (!t || t.length > 60) return false;
  return HEADING_RE.test(t) || /^[A-Za-z\s]+$/.test(t);
}

function splitBlocks(text) {
  return String(text || '')
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean);
}

function linesOf(block) {
  return String(block || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !isJunkLine(l));
}

function stripEndMarkers(text) {
  return String(text || '')
    .replace(END_MARKER_RE, '')
    .trim();
}

function stripVerseNumbers(text) {
  let s = String(text || '').trim();
  s = s.replace(/[।॥]+\s*[०-९0-9]+\s*[।॥]*/g, '');
  s = s.replace(/!+[०-९0-9]+!+/g, '');
  s = s.replace(/\|\|\s*[०-९0-9]+\s*\|\|/g, '');
  let prev;
  do {
    prev = s;
    s = s.replace(VERSE_TAIL_RE, '').trim();
  } while (s !== prev);
  return s.replace(/\s{2,}/g, ' ').trim();
}

/** Scraped shorthand repeat after the main line, e.g. `भरपूर॥ पूर है...` */
function stripEllipsisRefrainShorthand(line) {
  let s = String(line || '').trim();
  if (!/\.\.\./u.test(s)) return s;
  const afterDanda = s.match(/^(.+?॥)\s+.+?\.\.\.\s*$/u);
  if (afterDanda) return afterDanda[1].trim();
  return s.replace(/\s+.+?\.\.\.\s*$/u, '').trim();
}

function sanitizeStanzaText(text) {
  return linesOf(text)
    .map((l) => stripEllipsisRefrainShorthand(stripVerseNumbers(l)))
    .join('\n');
}

function parseEndMarker(text) {
  const m = String(text || '').match(END_MARKER_RE);
  if (!m) return { body: String(text || '').trim(), marker: null };
  const inner = (m[1] || '').replace(/\|\|/g, '').trim();
  if (/^(टेर|तेर)$/i.test(inner)) return { body: stripEndMarkers(text), marker: 'टेर' };
  if (/^[०१२३४५६७८९\d]+$/.test(inner)) {
    return { body: stripEndMarkers(text), marker: 'numbered' };
  }
  if (m[2]) return { body: stripEndMarkers(text), marker: '॥' };
  return { body: stripEndMarkers(text), marker: inner || null };
}

function isStructuredLyrics(lyrics) {
  return lyrics && typeof lyrics === 'object' && !Array.isArray(lyrics);
}

function normalizeBlock(text) {
  return sanitizeStanzaText(String(text || '').trim());
}

function blocksSimilar(a, b) {
  const x = normalizeBlock(a).replace(/\s+/g, ' ');
  const y = normalizeBlock(b).replace(/\s+/g, ' ');
  if (!x || !y) return false;
  return x === y || x.startsWith(y.slice(0, 40)) || y.startsWith(x.slice(0, 40));
}

function extractTarzLine(lines) {
  if (!lines.length) return { tarz: null, lines };
  const m = lines[0].match(TARZ_LINE_RE);
  if (m) return { tarz: m[1].trim(), lines: lines.slice(1) };
  return { tarz: null, lines };
}

function normLine(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .replace(/[॥|]/g, '')
    .trim();
}

function deriveHookPhrases(lines, title) {
  const phrases = new Set();
  const add = (s) => {
    const t = String(s || '').trim();
    if (!t) return;
    phrases.add(t);
    const comma = t.indexOf(',');
    if (comma > 0) phrases.add(t.slice(0, comma).trim());
  };
  add(title);
  if (lines[0]) add(lines[0].split(',')[0]);
  return [...phrases].filter((p) => p.length >= 6);
}

/** Standalone refrain / chorus repeat — not a तर्ज tail embedded in a verse line */
function isRefrainOnlyLine(line, hookPhrases) {
  const t = String(line || '').trim();
  if (!t) return true;
  if (/\.\.\./.test(t)) return true;

  const body = stripEndMarkers(t);
  if (body.includes(',') && body.length > 48) return false;

  const b = normLine(body);

  for (const hook of hookPhrases) {
    const h = normLine(hook);
    if (!h) continue;
    if (b === h) return true;
    const short = normLine(hook.split(',')[0]);
    if (short.length >= 8 && b === short) return true;
    if (short.length >= 10 && b.startsWith(short) && body.length <= hook.length + 10 && !/,/.test(body)) {
      return true;
    }
  }

  return false;
}

function stanzaFromBlock(blockText, hookPhrases) {
  const kept = linesOf(blockText).filter((l) => !isRefrainOnlyLine(l, hookPhrases));
  return kept.join('\n').trim();
}

function isRefrainRepeatBlock(blockText, hookPhrases, openingStanza) {
  const stanza = stanzaFromBlock(blockText, hookPhrases);
  if (!stanza) return true;
  if (openingStanza && blocksSimilar(stanza, openingStanza)) return true;
  return false;
}

function migrateBlankBlocksToStanzas(blocks, hookPhrases) {
  const stanzas = [];
  let openingStanza = '';

  for (const block of blocks) {
    const stanza = stanzaFromBlock(block, hookPhrases);
    if (!stanza) continue;
    if (openingStanza && isRefrainRepeatBlock(block, hookPhrases, openingStanza)) continue;
    stanzas.push(stanza);
    if (!openingStanza) openingStanza = stanza;
  }

  if (!stanzas.length) return { sthayi: '', paragraphs: [], strategy: 'empty-blocks' };

  let sthayi = stanzas[0];
  let rest = stanzas.slice(1);

  if (rest.length && !sthayi.includes('\n') && rest[0].includes('\n')) {
    const antaraLines = rest[0].split('\n').filter((l) => l.trim()).length;
    if (antaraLines <= 4) {
      sthayi = `${sthayi}\n${rest[0]}`.trim();
      rest = rest.slice(1);
    }
  }

  const parsed = parseEndMarker(sthayi.split('\n')[0] || sthayi);
  return {
    strategy: 'stanza-blocks',
    sthayi,
    sthayi_marker: parsed.marker === 'टेर' ? 'टेर' : null,
    paragraphs: rest,
  };
}

function normalizeFromLegacy(text) {
  const cleaned = cleanLyricsText(text);
  const blocks = splitBlocks(cleaned);
  const allLines = linesOf(cleaned);
  const hookPhrases = deriveHookPhrases(allLines, '');

  if (blocks.length >= 2) {
    const stanzaResult = migrateBlankBlocksToStanzas(blocks, hookPhrases);
    return {
      ...stanzaResult,
      lineCount: allLines.length,
      blockCount: blocks.length,
    };
  }

  if (allLines.length >= 2) {
    const parsed = parseEndMarker(allLines[0]);
    return {
      strategy: 'first-line-sthayi',
      sthayi: parsed.body,
      sthayi_marker: parsed.marker === 'टेर' ? 'टेर' : null,
      paragraphs: allLines.slice(1).map((l) => stripVerseNumbers(l)),
      lineCount: allLines.length,
      blockCount: 1,
    };
  }

  if (allLines.length === 1) {
    const parsed = parseEndMarker(allLines[0]);
    return {
      strategy: 'single-line',
      sthayi: parsed.body,
      sthayi_marker: parsed.marker === 'टेर' ? 'टेर' : null,
      paragraphs: [],
      lineCount: 1,
      blockCount: 1,
    };
  }

  return {
    strategy: 'empty',
    sthayi: '',
    sthayi_marker: null,
    paragraphs: [],
    lineCount: 0,
    blockCount: 0,
  };
}

const PAREN_TARZ_RE = /\(\s*(?:तर्ज|राग)\s*[-:：]?\s*([^)]+)\)/gi;
const PAREN_FILM_RE = /\(\s*फिल्म\s*[-:：]?\s*([^)]+)\)/gi;

function parseTarzFromLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return null;

  const tarzParts = [];
  let m;
  const tarzRe = new RegExp(PAREN_TARZ_RE.source, 'gi');
  while ((m = tarzRe.exec(trimmed)) !== null) tarzParts.push(m[1].trim());

  const filmParts = [];
  const filmRe = new RegExp(PAREN_FILM_RE.source, 'gi');
  while ((m = filmRe.exec(trimmed)) !== null) filmParts.push(m[1].trim());

  const plain = trimmed.match(TARZ_LINE_RE);
  if (plain) return { tarz: plain[1].trim(), restLine: '' };

  if (!tarzParts.length && !filmParts.length) return null;

  let tarz = tarzParts.join(' · ');
  if (filmParts.length) {
    const film = filmParts.join(' · ');
    tarz = tarz ? `${tarz} (${film})` : film;
  }

  const restLine = trimmed
    .replace(PAREN_TARZ_RE, '')
    .replace(PAREN_FILM_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { tarz, restLine };
}

function extractTarzFromText(text) {
  const lines = String(text || '').split('\n');
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i += 1;
  if (i >= lines.length) return { tarz: null, rest: '' };

  const parsed = parseTarzFromLine(lines[i]);
  if (parsed) {
    const restLines = [...lines.slice(0, i), ...lines.slice(i + 1)];
    if (parsed.restLine) restLines.splice(i, 0, parsed.restLine);
    return { tarz: parsed.tarz, rest: restLines.join('\n') };
  }

  const m = lines[i].trim().match(TARZ_LINE_RE);
  if (m) {
    const rest = [...lines.slice(0, i), ...lines.slice(i + 1)].join('\n');
    return { tarz: m[1].trim(), rest };
  }
  return { tarz: null, rest: text };
}

/** Convert legacy flat lyrics (+ optional doc.tarz) into sthayi + paragraphs */
function migrateDoc(doc) {
  const out = { ...doc };
  const raw = isStructuredLyrics(doc.lyrics)
    ? flattenLyricsText(doc.lyrics)
    : String(doc.lyrics || '');

  const { tarz: embeddedTarz, rest } = extractTarzFromText(raw);
  if (embeddedTarz && !out.tarz) out.tarz = embeddedTarz;

  const cleaned = cleanLyricsText(rest);
  const allLines = linesOf(cleaned);
  const hookPhrases = deriveHookPhrases(allLines, out.title || doc.title || '');
  const blocks = splitBlocks(cleaned);

  let norm;
  if (blocks.length >= 2) {
    norm = migrateBlankBlocksToStanzas(blocks, hookPhrases);
  } else {
    norm = normalizeFromLegacy(rest);
  }

  if (norm.strategy === 'empty' || norm.strategy === 'empty-blocks') {
    out.lyrics = { sthayi: '', paragraphs: [] };
    return out;
  }

  const cleanParas = (list) =>
    (list || []).filter((p) => {
      const t = String(p).trim();
      if (!t) return false;
      const first = linesOf(p)[0] || t;
      return !isHeadingLine(first);
    });

  out.lyrics = {
    sthayi: sanitizeStanzaText(norm.sthayi || ''),
    ...(norm.sthayi_marker ? { sthayi_marker: norm.sthayi_marker } : {}),
    paragraphs: cleanParas(norm.paragraphs).map(sanitizeStanzaText),
  };
  return out;
}

function mapLyricsStrings(doc, fn) {
  const out = { ...doc };
  if (!isStructuredLyrics(out.lyrics)) {
    if (typeof out.lyrics === 'string') out.lyrics = fn(out.lyrics);
    return out;
  }
  const applyPart = (part) => {
    const p = { ...part, paragraphs: [...(part.paragraphs || [])] };
    if (p.sthayi) p.sthayi = fn(p.sthayi);
    p.paragraphs = p.paragraphs.map(fn);
    return p;
  };
  if (out.lyrics.parts) {
    out.lyrics = { parts: out.lyrics.parts.map(applyPart) };
  } else {
    out.lyrics = applyPart(out.lyrics);
  }
  return out;
}

function flattenLyricsText(lyrics) {
  if (!lyrics) return '';
  if (typeof lyrics === 'string') return lyrics;
  const chunks = [];
  const renderPart = (p) => {
    if (p.pre_shlok) chunks.push(p.pre_shlok);
    if (p.sthayi) chunks.push(p.sthayi);
    for (const para of p.paragraphs || []) {
      if (para && typeof para === 'object' && para.commentary != null) {
        chunks.push(para.commentary);
        continue;
      }
      chunks.push(para);
    }
    if (p.dhvani) chunks.push(p.dhvani);
  };
  if (lyrics.parts) {
    for (const p of lyrics.parts) renderPart(p);
  } else {
    renderPart(lyrics);
  }
  return chunks.join('\n');
}

function toDevaNum(n) {
  return String(n)
    .split('')
    .map((d) => DEVA_DIGITS[Number(d)] ?? d)
    .join('');
}

function isMultilineParagraph(text) {
  return String(text || '').includes('\n');
}

function scoreNormalization(norm, title) {
  const reasons = [];
  const flags = [];
  let score = 50;

  const sthayi = norm.sthayi || norm.parts?.[0]?.sthayi || '';
  const paragraphs = norm.paragraphs || norm.parts?.flatMap((p) => p.paragraphs) || [];
  const { lineCount, strategy } = norm;
  const sthayiLines = linesOf(sthayi);
  const allParaLines = paragraphs.flatMap((p) => linesOf(p));

  if (strategy === 'empty') {
    return { score: 0, tier: 'low', reasons: ['empty-lyrics'], flags: ['empty'] };
  }

  if (strategy === 'stanza-blocks') {
    score = 88;
    reasons.push('stanza-blocks-no-refrain-lines');
    if (sthayiLines.length <= 4 && paragraphs.length >= 1) {
      score += 4;
      reasons.push('clear-sthayi-block');
    }
  } else if (strategy === 'first-line-sthayi') {
    score = 72;
    reasons.push('one-line-per-paragraph');
    const refrain = detectRefrainTail([sthayi, ...allParaLines]);
    if (refrain) {
      score += 14;
      reasons.push('refrain-hook-in-most-lines');
    }
    if (paragraphs.length >= 2 && paragraphs.length <= 15) {
      score += 8;
      reasons.push('typical-bhajan-shape');
    }
    if (paragraphs.length > 20) {
      score -= 12;
      flags.push('many-single-line-paragraphs');
    } else if (paragraphs.length > 15) {
      score -= 4;
      flags.push('long-song-many-verses');
    }
  } else if (strategy === 'single-line') {
    score = 38;
    reasons.push('only-one-line');
    flags.push('needs-manual-structure');
  }

  const headingHits = [sthayi, ...allParaLines].filter(isHeadingLine);
  if (headingHits.length) {
    score -= 35;
    flags.push('heading-line-in-lyrics');
  }

  if (lineCount > 35) {
    score -= 10;
    flags.push('very-long-song');
  }

  if (title && sthayi && title.trim() === sthayi.trim()) {
    score -= 15;
    flags.push('sthayi-equals-title');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  let tier = 'low';
  if (score >= 80) tier = 'high';
  else if (score >= 60) tier = 'medium';

  return {
    score,
    tier,
    reasons,
    flags,
    autoFormat: score >= 80,
    review: score >= 60 && score < 80,
    manual: score < 60,
  };
}

function detectRefrainTail(lines) {
  if (lines.length < 2) return null;
  const tails = lines.map((line) => {
    const parts = line.split(/[,،]/);
    const tail = (parts[parts.length - 1] || line).trim();
    return tail.length >= 12 ? tail : line.slice(-Math.min(40, line.length)).trim();
  });
  const first = tails[0];
  if (first.length < 8) return null;
  const hits = tails.slice(1).filter((t) => t === first || t.includes(first) || first.includes(t)).length;
  if (hits >= Math.max(1, Math.floor((lines.length - 1) * 0.45))) return first;
  return null;
}

function analyzeBhajanLyrics(lyricsText, title) {
  const norm = normalizeFromLegacy(typeof lyricsText === 'string' ? lyricsText : flattenLyricsText(lyricsText));
  const scoring = scoreNormalization(norm, title);
  const sthayi = norm.sthayi || norm.parts?.[0]?.sthayi || '';
  const paragraphs = norm.paragraphs || norm.parts?.flatMap((p) => p.paragraphs) || [];
  return {
    ...norm,
    ...scoring,
    paragraphCount: paragraphs.length,
    sthayiPreview: sthayi.split('\n')[0].slice(0, 80),
  };
}

module.exports = {
  analyzeBhajanLyrics,
  migrateDoc,
  extractTarzFromText,
  normalizeFromLegacy,
  flattenLyricsText,
  mapLyricsStrings,
  isStructuredLyrics,
  stripEndMarkers,
  stripVerseNumbers,
  stripEllipsisRefrainShorthand,
  sanitizeStanzaText,
  parseEndMarker,
  toDevaNum,
  isMultilineParagraph,
  scoreNormalization,
};
