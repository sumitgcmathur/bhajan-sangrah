/**
 * Shape-aware migration for content/ambe (flat scraped lyrics → sthayi + paragraphs).
 */
const { cleanLyricsText, isJunkLine } = require('./clean-lyrics');
const {
  extractTarzFromText,
  isStructuredLyrics,
  flattenLyricsText,
  stripVerseNumbers,
} = require('./lyrics-structure');

const TER_RE = /(?:॥\s*(?:टेर|तेर)\s*॥?|\|\|\s*(?:टेर|तेर)\s*\|\|)/i;
const NUMBERED_END_RE = /(?:॥\s*[०-९0-9]+\s*॥?|\|\|\s*[०-९0-9]+\s*\|\|)\s*$/;
const CHORUS_LINE_RE = /जय\s+जय\s+माँ\s+महिषासुर/i;
const ELLIPSIS_RE = /\.{3,}/;

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&');
}

function stripDotPadding(line) {
  return String(line || '')
    .replace(/\.{4,}/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function stripEllipsisTail(line) {
  let s = String(line || '').trim();
  if (!ELLIPSIS_RE.test(s)) return s;
  const afterDanda = s.match(/^(.+?[।॥])\s+.+?\.{3,}\s*$/u);
  if (afterDanda) return afterDanda[1].trim();
  if (/^\.{3,}/.test(s)) return '';
  return s.replace(/\s*\.{3,}.*$/u, '').trim();
}

function stripTerMarker(line) {
  return String(line || '')
    .replace(/॥\s*(?:टेर|तेर)\s*॥/gi, '॥')
    .replace(/\|\|\s*(?:टेर|तेर)\s*\|\|/gi, '॥')
    .trim();
}

function normalizeDandas(line) {
  return String(line || '')
    .replace(/\|\|/g, '॥')
    .replace(/\s+/g, ' ')
    .trim();
}

/** No space before । / ॥; collapse doubled dandas (।॥ → ॥). */
function normalizeLineEndings(line) {
  let s = normalizeDandas(line);
  s = s.replace(/\s+([।॥])/g, '$1');
  s = s.replace(/([।॥])\s+([।॥])/g, '$1$2');
  s = s.replace(/।॥/g, '॥');
  s = s.replace(/॥+/g, '॥');
  s = s.replace(/।+/g, (m) => (m.length > 1 ? '॥' : '।'));
  s = s.replace(/([।॥])\s*,\s*/g, '$1\n');
  return s.trim();
}

/** Final pass on sthayi/paragraph blocks: no `,,` / `,।` / `,॥`; each line ends in । or ॥. */
function sanitizeLyricBlock(text) {
  let s = decodeHtmlEntities(text);
  s = s.replace(/\|\|/g, '॥');
  s = s.replace(/,{2,}/g, ',');
  s = s.replace(/,\s*([।॥])/g, '$1');
  s = s.replace(/([।॥])\s*,\s*/g, '$1\n');

  const lines = s.split('\n');
  const out = [];
  for (const line of lines) {
    let t = line.trim();
    if (!t) continue;
    t = t.replace(/,{2,}/g, ',');
    t = t.replace(/,\s*([।॥])/g, '$1');
    t = t.replace(/([।॥])\s*,\s*/g, '$1');
    t = t.replace(/[,，\s]+$/u, '');
    if (!/[।॥]$/.test(t)) t += '।';
    out.push(t);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function cleanAmbeLine(line) {
  let s = decodeHtmlEntities(line);
  s = stripDotPadding(s);
  s = stripEllipsisTail(s);
  s = stripTerMarker(s);
  s = stripVerseNumbers(s);
  return normalizeLineEndings(s);
}

function rawLines(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !isJunkLine(l));
}

function isTerLine(line) {
  return TER_RE.test(String(line || ''));
}

function isEllipsisEchoLine(line) {
  const s = String(line || '').trim();
  if (!ELLIPSIS_RE.test(s)) return false;
  const without = stripEllipsisTail(s);
  if (!without || without.length < 12) return true;
  if (without.length < 36 && !/[।॥]/.test(without)) return true;
  return false;
}

function isChorusLine(line) {
  return CHORUS_LINE_RE.test(String(line || ''));
}

function joinLines(chunk) {
  return chunk.map(cleanAmbeLine).filter(Boolean).join('\n').trim();
}

function pairChunks(lines, startIdx) {
  const paras = [];
  for (let i = startIdx; i < lines.length; i += 2) {
    if (isEllipsisEchoLine(lines[i])) continue;
    if (i + 1 < lines.length && !isEllipsisEchoLine(lines[i + 1])) {
      paras.push(joinLines([lines[i], lines[i + 1]]));
    } else if (!isEllipsisEchoLine(lines[i])) {
      paras.push(cleanAmbeLine(lines[i]));
    }
  }
  return paras;
}

function singleChunks(lines, startIdx) {
  const paras = [];
  for (let i = startIdx; i < lines.length; i += 1) {
    if (isEllipsisEchoLine(lines[i])) continue;
    paras.push(cleanAmbeLine(lines[i]));
  }
  return paras.filter(Boolean);
}

function findRepeatingRefrain(lines, startIdx) {
  const counts = new Map();
  for (let i = startIdx; i < lines.length; i += 1) {
    const key = normKey(lines[i]);
    if (key.length < 14) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count >= 2 && key.length > bestCount) {
      bestCount = count;
      best = key;
    }
  }
  return best;
}

function normKey(line) {
  return String(line || '')
    .replace(/[।॥|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48);
}

function lineMatchesRefrain(line, refrainKey) {
  if (!refrainKey) return false;
  const k = normKey(line);
  if (k === refrainKey || k.includes(refrainKey) || refrainKey.includes(k)) return true;
  const short = Math.min(k.length, refrainKey.length, 24);
  return short >= 12 && k.slice(0, short) === refrainKey.slice(0, short);
}

function groupByRefrain(lines, startIdx, refrainKey) {
  const paras = [];
  let buf = [];
  for (let i = startIdx; i < lines.length; i += 1) {
    if (isEllipsisEchoLine(lines[i])) continue;
    buf.push(lines[i]);
    if (lineMatchesRefrain(lines[i], refrainKey) && buf.length >= 2) {
      paras.push(joinLines(buf));
      buf = [];
    }
  }
  if (buf.length) paras.push(joinLines(buf));
  return paras;
}

function groupFixedLines(lines, startIdx, size) {
  const paras = [];
  for (let i = startIdx; i < lines.length; i += size) {
    const chunk = lines.slice(i, i + size).filter((l) => !isEllipsisEchoLine(l));
    if (chunk.length) paras.push(joinLines(chunk));
  }
  return paras;
}

function groupEllipsisStanzas(lines) {
  const paras = [];
  let buf = [];
  for (let i = 1; i < lines.length; i += 1) {
    if (isEllipsisEchoLine(lines[i])) {
      if (buf.length) paras.push(joinLines(buf));
      buf = [];
      continue;
    }
    buf.push(lines[i]);
    if (buf.length === 4) {
      paras.push(joinLines(buf));
      buf = [];
    }
  }
  if (buf.length) paras.push(joinLines(buf));
  return paras;
}

function groupChorusQuads(lines, startIdx) {
  const paras = [];
  let buf = [];
  for (let i = startIdx; i < lines.length; i += 1) {
    if (isEllipsisEchoLine(lines[i])) continue;
    buf.push(lines[i]);
    if (isChorusLine(lines[i])) {
      paras.push(joinLines(buf));
      buf = [];
    }
  }
  if (buf.length) paras.push(joinLines(buf));
  if (!paras.length) return singleChunks(lines, startIdx);
  return paras;
}

function groupNumberedStanzas(lines, sthayiEndIdx) {
  const paras = [];
  let buf = [];
  for (let i = sthayiEndIdx; i < lines.length; i += 1) {
    if (isEllipsisEchoLine(lines[i])) continue;
    buf.push(lines[i]);
    if (NUMBERED_END_RE.test(lines[i])) {
      paras.push(joinLines(buf));
      buf = [];
    }
  }
  if (buf.length) paras.push(joinLines(buf));
  return paras;
}

function findTerLineIndex(lines, startAt = 1) {
  for (let i = startAt; i < lines.length; i += 1) {
    if (isTerLine(lines[i])) return i;
  }
  return -1;
}

function shouldPairLines(lines) {
  if (lines.length < 2 || lines.length % 2 !== 0) return false;
  const avg = lines.reduce((s, l) => s + l.length, 0) / lines.length;
  return avg < 120;
}

function detectAmbeShape(lines) {
  if (lines.length <= 1) return 'single';

  const numberedIdx = lines
    .map((l, i) => (NUMBERED_END_RE.test(l) ? i : -1))
    .filter((i) => i >= 0);
  if (numberedIdx.length >= 2) return 'numbered-stanzas';

  const ellipsisEchoCount = lines.filter(isEllipsisEchoLine).length;
  if (ellipsisEchoCount >= 2) return 'ellipsis-stanzas';

  if (lines.length >= 5 && lineMatchesRefrain(lines[4], normKey(lines[0]))) {
    return 'refrain-stanza';
  }

  const terAt = findTerLineIndex(lines, 1);
  if (terAt === 1 && !isTerLine(lines[0])) return 'ter-split';
  if (terAt === 2 && lines.length > 3) return 'ter-split-triple';
  if (terAt > 2) return 'ter-split-triple';

  if (isTerLine(lines[0])) return 'ter-single';

  const chorusHits = lines.filter(isChorusLine).length;
  if (chorusHits >= 3) return 'chorus-quad';

  const refrainKey = findRepeatingRefrain(lines, 1);
  if (refrainKey) {
    const hits = lines.slice(1).filter((l) => lineMatchesRefrain(l, refrainKey)).length;
    if (hits >= 2) {
      const intervals = [];
      let last = -1;
      for (let i = 1; i < lines.length; i += 1) {
        if (lineMatchesRefrain(lines[i], refrainKey)) {
          if (last >= 0) intervals.push(i - last);
          last = i;
        }
      }
      if (intervals.length >= 2 && intervals.every((n) => n === intervals[0])) {
        return `refrain-every-${intervals[0]}`;
      }
      return 'refrain-blocks';
    }
  }

  const firstNum = lines.findIndex((l) => NUMBERED_END_RE.test(l));
  if (firstNum >= 3 && firstNum <= 5) return 'triple-sthayi-single';
  if (firstNum === 2 && lines.length > 4) return 'triple-sthayi-single';

  const rest = lines.slice(1);
  const evenPairs =
    rest.length >= 2 &&
    rest.length % 2 === 0 &&
    rest.every((l) => !NUMBERED_END_RE.test(l) || stripVerseNumbers(l).length > 20);

  if (evenPairs && rest.length >= 2) {
    const avgLen = rest.reduce((s, l) => s + l.length, 0) / rest.length;
    if (avgLen < 120) return 'pairs';
  }

  if (lines.length >= 4 && lines.length % 2 === 0 && !lines[0].includes('॥')) {
    return 'pairs';
  }

  return 'single';
}

function migrateAmbeLines(lines, title) {
  const cleaned = lines.map((l) => decodeHtmlEntities(l).trim()).filter(Boolean);
  const shape = detectAmbeShape(cleaned);

  let sthayi = '';
  let paragraphs = [];
  let strategy = shape;

  switch (shape) {
    case 'ter-split': {
      const terIdx = findTerLineIndex(cleaned, 1);
      const sthayiEnd = terIdx >= 0 ? terIdx + 1 : 2;
      sthayi = joinLines(cleaned.slice(0, sthayiEnd));
      const rest = cleaned.slice(sthayiEnd);
      paragraphs = shouldPairLines(rest) ? pairChunks(rest, 0) : singleChunks(rest, 0);
      break;
    }

    case 'ter-split-triple': {
      const terIdx = findTerLineIndex(cleaned, 1);
      const sthayiEnd = terIdx >= 0 ? terIdx + 1 : 3;
      sthayi = joinLines(cleaned.slice(0, sthayiEnd));
      paragraphs = singleChunks(cleaned, sthayiEnd);
      break;
    }

    case 'ter-single':
      sthayi = joinLines([cleaned[0]]);
      paragraphs = pairChunks(cleaned, 1);
      break;

    case 'triple-sthayi-single': {
      const terIdx = findTerLineIndex(cleaned, 1);
      const end = terIdx >= 0 ? terIdx + 1 : 3;
      sthayi = joinLines(cleaned.slice(0, Math.min(end, cleaned.length)));
      paragraphs = singleChunks(cleaned, Math.min(end, cleaned.length));
      break;
    }

    case 'numbered-stanzas': {
      const terIdx = findTerLineIndex(cleaned, 0);
      const sthayiEnd = terIdx >= 0 ? terIdx + 1 : 2;
      sthayi = joinLines(cleaned.slice(0, sthayiEnd));
      paragraphs = groupNumberedStanzas(cleaned, sthayiEnd);
      break;
    }

    case 'chorus-quad':
      sthayi = cleanAmbeLine(cleaned[0]);
      paragraphs = groupChorusQuads(cleaned, 1);
      break;

    case 'refrain-blocks': {
      sthayi = cleanAmbeLine(cleaned[0]);
      const refrainKey = findRepeatingRefrain(cleaned, 1) || normKey(cleaned[0]);
      paragraphs = groupByRefrain(cleaned, 1, refrainKey);
      break;
    }

    case 'refrain-stanza':
      sthayi = cleanAmbeLine(cleaned[0]);
      paragraphs = groupByRefrain(cleaned, 1, normKey(cleaned[0]));
      break;

    case 'ellipsis-stanzas':
      sthayi = cleanAmbeLine(cleaned[0]);
      paragraphs = groupEllipsisStanzas(cleaned);
      break;

    case 'pairs':
      sthayi = cleanAmbeLine(cleaned[0]);
      paragraphs = pairChunks(cleaned, 1);
      break;

    case 'single':
      sthayi = cleanAmbeLine(cleaned[0]);
      paragraphs = singleChunks(cleaned, 1);
      break;

    default:
      if (shape.startsWith('refrain-every-')) {
        const size = Number(shape.replace('refrain-every-', '')) || 4;
        sthayi = cleanAmbeLine(cleaned[0]);
        paragraphs = groupFixedLines(cleaned, 1, size);
      } else {
        sthayi = cleanAmbeLine(cleaned[0]);
        paragraphs = singleChunks(cleaned, 1);
      }
      break;
  }

  if (!paragraphs.length && cleaned.length > 1) {
    paragraphs = singleChunks(cleaned, 1);
    strategy = 'single-fallback';
  }

  return { strategy, sthayi, paragraphs };
}

function migrateAmbeDoc(doc) {
  const out = { ...doc };
  const raw = isStructuredLyrics(doc.lyrics)
    ? flattenLyricsText(doc.lyrics)
    : String(doc.lyrics || '');

  const { tarz: embeddedTarz, rest } = extractTarzFromText(raw);
  if (embeddedTarz && !out.tarz) out.tarz = embeddedTarz;

  const lines = rawLines(cleanLyricsText(rest));
  if (!lines.length) {
    out.lyrics = { sthayi: '', paragraphs: [] };
    return out;
  }

  const { strategy, sthayi, paragraphs } = migrateAmbeLines(lines, out.title || doc.title || '');
  out.lyrics = {
    sthayi: sanitizeLyricBlock(sthayi),
    paragraphs: paragraphs.filter(Boolean).map(sanitizeLyricBlock),
  };
  out._ambeStrategy = strategy;
  return out;
}

module.exports = {
  migrateAmbeDoc,
  migrateAmbeLines,
  detectAmbeShape,
  cleanAmbeLine,
  normalizeLineEndings,
  sanitizeLyricBlock,
  decodeHtmlEntities,
};
