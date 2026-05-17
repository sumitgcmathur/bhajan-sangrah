/**
 * Migration for content/horiya — ganpati-style hooks + Horiya chorus phrases.
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
const HOOK_TAIL_RE = /(?:\.{2,}|…)(?:\s*\S+)?\s*$/u;

const HORIYA_CHORUS_HOOKS = [
  'आज ब्रिज में होरी ओ रसिया',
  'खेलो जी खेलो गंग श्याम मो संग होरी खेलो',
  'राधे और रंग दे',
  'काना धर लो',
  'महीनो फागण रो',
  'खेले माडाणी',
];

function preprocessHoriyaLine(line) {
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
    .map((l) => preprocessHoriyaLine(l))
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

function lineEndsWithChorusPhrase(line) {
  const s = String(line || '').trim();
  return HORIYA_CHORUS_HOOKS.some((h) => {
    const idx = s.lastIndexOf(h);
    return idx >= 0 && idx >= s.length - h.length - 4;
  });
}

function endsWithHook(line) {
  const s = String(line || '').trim();
  if (HOOK_TAIL_RE.test(s)) return true;
  if (lineEndsWithChorusPhrase(line)) return true;
  if (/\.\.\./.test(s) && /(?:रे|रो|रा|जी|खेलो|होरी|रसिया|माडाणी)\s*\.{2,}\s*$/iu.test(s)) return true;
  if (/\.\.\.\s*[^.]+\s*(?:\|\||॥)\s*$/u.test(s)) return true;
  if (
    HORIYA_CHORUS_HOOKS.some(
      (h) => s.includes(h) && (/(?:॥|\||।)\s*$/u.test(s) || /\.\.\./.test(s))
    )
  ) {
    return true;
  }
  return false;
}

function detectHoriyaChorusHook(lines) {
  for (const hook of HORIYA_CHORUS_HOOKS) {
    const hits = lines.filter((l) => String(l).includes(hook)).length;
    if (hits >= 2) return hook;
  }
  return null;
}

function migrateRefrainLines(lines) {
  const terIdx = findTerLineIndex(lines, 0);
  const sthayiEnd = terIdx >= 0 ? terIdx + 1 : 1;
  return {
    strategy: 'refrain-line',
    sthayi: joinLines(lines.slice(0, sthayiEnd)),
    paragraphs: lines.slice(sthayiEnd).map((l) => cleanAmbeLine(l)),
  };
}

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

function migrateChorusHookStanzas(lines, hookPhrase) {
  if (String(lines[0] || '').includes(hookPhrase)) {
    return migrateHookStanzas(lines);
  }

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

function detectHoriyaShape(lines) {
  if (lines.length <= 1) return 'single';

  const hookLines = lines.filter((l) => endsWithHook(l)).length;
  if (hookLines >= 2) return 'hook-stanzas';

  const chorusHook = detectHoriyaChorusHook(lines);
  if (chorusHook && !String(lines[0] || '').includes(chorusHook)) {
    return { type: 'chorus-hook', hook: chorusHook };
  }

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

function migrateHoriyaLines(lines, title) {
  const cleaned = lines.map(preprocessHoriyaLine).filter(Boolean);
  if (!cleaned.length) {
    return { strategy: 'empty', sthayi: '', paragraphs: [] };
  }

  const shape = detectHoriyaShape(cleaned);

  if (shape === 'hook-stanzas') {
    return migrateHookStanzas(cleaned);
  }
  if (shape && typeof shape === 'object' && shape.type === 'chorus-hook') {
    return migrateChorusHookStanzas(cleaned, shape.hook);
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

function migrateHoriyaDoc(doc) {
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
    out._horiyaStrategy = 'empty';
    return out;
  }

  const { strategy, sthayi, paragraphs } = migrateHoriyaLines(lines, out.title || doc.title || '');
  out.lyrics = {
    sthayi,
    paragraphs: paragraphs.filter(Boolean),
  };
  out._horiyaStrategy = strategy;
  return out;
}

module.exports = {
  migrateHoriyaDoc,
  migrateHoriyaLines,
  preprocessHoriyaLine,
};
