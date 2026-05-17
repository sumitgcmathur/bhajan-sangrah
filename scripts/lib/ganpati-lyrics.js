/**
 * Migration for content/ganpati — ambe shapes + Ganpati refrain / hook patterns.
 */
const { cleanLyricsText, isJunkLine } = require('./clean-lyrics');
const {
  extractTarzFromText,
  isStructuredLyrics,
  flattenLyricsText,
} = require('./lyrics-structure');
const {
  migrateAmbeLines,
  cleanAmbeLine,
  decodeHtmlEntities,
  detectAmbeShape,
} = require('./ambe-lyrics');

const TER_RE = /॥\s*टेर\s*॥|।।\s*टेर|टेर\s*।+|।\s*टेर\s*।/i;
const HOOK_TAIL_RE = /(?:\.{2,}|…)\s*\S+/;

function preprocessGanpatiLine(line) {
  let s = decodeHtmlEntities(line);
  s = s.replace(/।।\s*टेर\s*।+[l|]?/gi, '॥टेर॥');
  s = s.replace(/।\s*टेर\s*।+/gi, '॥टेर॥');
  s = s.replace(/\|\|\s*([०-९0-9]+)\s*\|\|/gi, '॥$1॥');
  s = s.replace(/।।\s*([०-९0-9]+)\s*।।/gi, '॥$1॥');
  s = s.replace(/\s*\.{2,}\s*(?=॥\s*[०-९0-9])/g, ' ');
  if (/॥\s*[०-९0-9]/.test(s)) {
    s = s.replace(/\s*\.{2,}/g, ' ');
  }
  if (/\.\.\.\s*\S/.test(s)) {
    s = s.replace(/\s*\.{3,}\s*/g, ' … ');
  }
  return s.replace(/\s+/g, ' ').trim();
}

function rawLines(text) {
  return String(text || '')
    .split('\n')
    .map((l) => preprocessGanpatiLine(l))
    .filter((l) => l && !isJunkLine(l));
}

function joinLines(chunk) {
  return chunk.map(cleanAmbeLine).filter(Boolean).join('\n').trim();
}

function findTerLineIndex(lines, startAt = 0) {
  for (let i = startAt; i < lines.length; i += 1) {
    if (TER_RE.test(lines[i])) return i;
  }
  return -1;
}

function normKey(line) {
  return String(line || '')
    .replace(/[।॥|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48);
}

function lineTailKey(line, len = 36) {
  const t = String(line || '').trim();
  return normKey(t.slice(Math.max(0, t.length - len)));
}

function findRepeatingRefrain(lines, startIdx) {
  const counts = new Map();
  for (let i = startIdx; i < lines.length; i += 1) {
    const tail = lineTailKey(lines[i]);
    if (tail.length < 10) continue;
    counts.set(tail, (counts.get(tail) || 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count >= 2 && count > bestCount) {
      bestCount = count;
      best = key;
    }
  }
  return best;
}

function lineMatchesRefrain(line, refrainKey) {
  if (!refrainKey) return false;
  const tail = lineTailKey(line);
  if (tail === refrainKey || tail.includes(refrainKey) || refrainKey.includes(tail)) return true;
  const k = normKey(line);
  return k.includes(refrainKey) || refrainKey.includes(k);
}

function endsWithHook(line) {
  return HOOK_TAIL_RE.test(String(line || ''));
}

/** One long line per antara (refrain tail repeated each line). */
function migrateRefrainLines(lines) {
  const terIdx = findTerLineIndex(lines, 0);
  const sthayiEnd = terIdx >= 0 ? terIdx + 1 : 1;
  return {
    strategy: 'refrain-line',
    sthayi: joinLines(lines.slice(0, sthayiEnd)),
    paragraphs: lines.slice(sthayiEnd).map((l) => cleanAmbeLine(l)),
  };
}

/** Antaras grouped until a `. .hook` or `… hook` line. */
function migrateHookStanzas(lines) {
  const sthayiParts = [lines[0]];
  let i = 1;
  if (lines[1] && !endsWithHook(lines[1]) && lines.length > 3) {
    sthayiParts.push(lines[1]);
    i = 2;
  }

  const paragraphs = [];
  let buf = [];
  for (; i < lines.length; i += 1) {
    buf.push(lines[i]);
    if (endsWithHook(lines[i])) {
      paragraphs.push(joinLines(buf));
      buf = [];
    }
  }
  if (buf.length) paragraphs.push(joinLines(buf));

  return {
    strategy: 'hook-stanzas',
    sthayi: joinLines(sthayiParts),
    paragraphs,
  };
}

/** Modern / film-style: group until a closing `… hook` phrase. */
function migrateChorusHookStanzas(lines, hookPhrase) {
  let i = 0;
  const sthayiParts = [];
  while (i < lines.length && !String(lines[i]).includes(hookPhrase)) {
    sthayiParts.push(lines[i]);
    i += 1;
    if (sthayiParts.length >= 2 && i < lines.length && String(lines[i]).includes(hookPhrase)) {
      break;
    }
  }

  const paragraphs = [];
  let buf = [];
  for (; i < lines.length; i += 1) {
    buf.push(lines[i]);
    if (String(lines[i]).includes(hookPhrase)) {
      paragraphs.push(joinLines(buf));
      buf = [];
    }
  }
  if (buf.length) paragraphs.push(joinLines(buf));

  return {
    strategy: 'chorus-hook',
    sthayi: joinLines(sthayiParts),
    paragraphs,
  };
}

function detectGanpatiShape(lines) {
  if (lines.length <= 1) return 'single';

  const hookLines = lines.filter((l) => endsWithHook(l)).length;
  if (hookLines >= 2) return 'hook-stanzas';

  if (lines.some((l) => /गौरी के नन्दन की/i.test(l))) return 'chorus-hook';

  const refrainKey = findRepeatingRefrain(lines, 1);
  if (refrainKey) {
    const body = lines.slice(1);
    const hits = body.filter((l) => lineMatchesRefrain(l, refrainKey)).length;
    if (hits >= Math.max(2, Math.ceil(body.length * 0.5))) return 'refrain-line';
  }

  const ambeShape = detectAmbeShape(lines);
  if (ambeShape === 'pairs' || ambeShape === 'ter-single') {
    const body = lines.slice(1);
    if (body.length >= 3 && body.every((l) => l.length >= 45)) return 'refrain-line';
  }
  return ambeShape;
}

function migrateGanpatiLines(lines, title) {
  const cleaned = lines.map(preprocessGanpatiLine).filter(Boolean);
  if (!cleaned.length) {
    return { strategy: 'empty', sthayi: '', paragraphs: [] };
  }

  const shape = detectGanpatiShape(cleaned);

  if (shape === 'hook-stanzas') {
    return migrateHookStanzas(cleaned);
  }
  if (shape === 'chorus-hook') {
    return migrateChorusHookStanzas(cleaned, 'गौरी के नन्दन की');
  }
  if (shape === 'refrain-line') {
    return migrateRefrainLines(cleaned);
  }

  const migrated = migrateAmbeLines(cleaned, title);
  const tailKey = findRepeatingRefrain(cleaned, 1);
  const tailHits = tailKey
    ? cleaned.slice(1).filter((l) => lineMatchesRefrain(l, tailKey)).length
    : 0;
  if (
    tailHits >= 3 &&
    (migrated.strategy === 'pairs' ||
      migrated.strategy === 'ter-single' ||
      migrated.paragraphs.some((p) => String(p).includes('\n')))
  ) {
    return migrateRefrainLines(cleaned);
  }
  return migrated;
}

function migrateGanpatiDoc(doc) {
  const out = { ...doc };
  delete out.jabani;

  const raw = isStructuredLyrics(doc.lyrics)
    ? flattenLyricsText(doc.lyrics)
    : String(doc.lyrics || '');

  let { tarz: embeddedTarz, rest } = extractTarzFromText(raw);
  if (!embeddedTarz) {
    const paren = String(raw).match(/^\s*\(\s*तर्ज\s*[-:：]?\s*([^)]+)\)/im);
    if (paren) {
      embeddedTarz = paren[1].trim();
      rest = String(raw).replace(/^\s*\(\s*तर्ज[^)]*\)\s*\n?/im, '');
    }
  }
  if (embeddedTarz && !out.tarz) out.tarz = embeddedTarz;

  const lines = rawLines(cleanLyricsText(rest));
  if (!lines.length) {
    out.lyrics = { sthayi: '', paragraphs: [] };
    out._ganpatiStrategy = 'empty';
    return out;
  }

  const { strategy, sthayi, paragraphs } = migrateGanpatiLines(lines, out.title || doc.title || '');
  out.lyrics = {
    sthayi,
    paragraphs: paragraphs.filter(Boolean),
  };
  out._ganpatiStrategy = strategy;
  return out;
}

module.exports = {
  migrateGanpatiDoc,
  migrateGanpatiLines,
  preprocessGanpatiLine,
};
