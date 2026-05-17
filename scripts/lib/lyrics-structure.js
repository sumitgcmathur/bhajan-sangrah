const { cleanLyricsText, isJunkLine } = require('./clean-lyrics');

const HEADING_RE =
  /^(अम्बे|अंबे|गणपति|विविध|शिव|राम|कृष्ण|हनुमान|होरिया|आरती|मूल\s*तत्त्व|स्वरचित).{0,24}(भजन|गान)$/i;

const DEVA_DIGITS = '०१२३४५६७८९';
const END_MARKER_RE = /(?:\s*(\|\|\s*[^|]+\s*\|\|)|(\s*॥+))\s*$/u;
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
  return stripEndMarkers(String(text || '').trim());
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

function migrateBlankBlocksToParts(blocks) {
  const parts = [];
  let i = 0;
  while (i < blocks.length) {
    const sthayi = normalizeBlock(blocks[i]);
    i += 1;
    const paragraphs = [];
    while (i < blocks.length && !blocksSimilar(blocks[i], sthayi)) {
      paragraphs.push(normalizeBlock(blocks[i]));
      i += 1;
    }
    if (sthayi || paragraphs.length) {
      const parsed = parseEndMarker(sthayi);
      parts.push({
        sthayi: parsed.body,
        sthayi_marker: parsed.marker === 'टेर' ? 'टेर' : null,
        paragraphs,
      });
    }
    if (i < blocks.length && blocksSimilar(blocks[i], sthayi)) {
      continue;
    }
  }
  return parts;
}

function normalizeFromLegacy(text) {
  const cleaned = cleanLyricsText(text);
  const blocks = splitBlocks(cleaned);
  const allLines = linesOf(cleaned);

  if (blocks.length >= 2) {
    const parts = migrateBlankBlocksToParts(blocks);
    if (parts.length > 1) {
      return {
        strategy: 'blank-blocks-parts',
        parts,
        lineCount: allLines.length,
        blockCount: blocks.length,
      };
    }
    const p = parts[0] || { sthayi: '', paragraphs: [] };
    return {
      strategy: 'blank-blocks',
      sthayi: p.sthayi,
      sthayi_marker: p.sthayi_marker,
      paragraphs: p.paragraphs,
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
      paragraphs: allLines.slice(1).map((l) => stripEndMarkers(l)),
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

function extractTarzFromText(text) {
  const lines = String(text || '').split('\n');
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i += 1;
  if (i >= lines.length) return { tarz: null, rest: '' };
  const m = lines[i].trim().match(TARZ_LINE_RE);
  if (m) {
    const rest = [...lines.slice(0, i), ...lines.slice(i + 1)].join('\n');
    return { tarz: m[1].trim(), rest };
  }
  return { tarz: null, rest: text };
}

/** Convert legacy flat lyrics (+ optional doc.tarz) into structured lyrics object */
function migrateDoc(doc) {
  const out = { ...doc };
  if (isStructuredLyrics(doc.lyrics)) {
    return out;
  }
  const raw = String(doc.lyrics || '');
  const { tarz: embeddedTarz, rest } = extractTarzFromText(raw);
  if (embeddedTarz && !out.tarz) out.tarz = embeddedTarz;

  const norm = normalizeFromLegacy(rest);
  if (norm.strategy === 'empty') {
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

  if (norm.parts) {
    out.lyrics = {
      parts: norm.parts.map((p) => ({
        sthayi: p.sthayi || '',
        ...(p.sthayi_marker ? { sthayi_marker: p.sthayi_marker } : {}),
        paragraphs: cleanParas(p.paragraphs),
      })),
    };
    return out;
  }

  out.lyrics = {
    sthayi: norm.sthayi || '',
    ...(norm.sthayi_marker ? { sthayi_marker: norm.sthayi_marker } : {}),
    paragraphs: cleanParas(norm.paragraphs),
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
    if (p.sthayi) chunks.push(p.sthayi);
    for (const para of p.paragraphs || []) chunks.push(para);
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

  if (strategy === 'blank-blocks-parts') {
    score = 58;
    reasons.push('aarti-style-parts');
    flags.push('repeated-sthayi-between-blocks');
  } else if (strategy === 'blank-blocks') {
    score = 82;
    reasons.push('blank-line-blocks');
    if (sthayiLines.length <= 4 && paragraphs.length >= 1) {
      score += 6;
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
  normalizeFromLegacy,
  flattenLyricsText,
  mapLyricsStrings,
  isStructuredLyrics,
  stripEndMarkers,
  parseEndMarker,
  toDevaNum,
  isMultilineParagraph,
  scoreNormalization,
};
