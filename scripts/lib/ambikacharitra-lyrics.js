/**
 * Shape-aware migration for अंबिका चरित्र (narrative + stuti + doha patterns).
 */
const { cleanLyricsText, isJunkLine } = require('./clean-lyrics');
const {
  isStructuredLyrics,
  flattenLyricsText,
  stripVerseNumbers,
} = require('./lyrics-structure');
const { migrateAmbeLines, cleanAmbeLine, normalizeLineEndings } = require('./ambe-lyrics');
const { convertAartiCoupletLyrics, analyzeAartiConversion } = require('./aarti-couplet-convert');

const RAGA_RE = /^राग\s*[:：\-–—]/i;
const TARZ_RE = /^तर्ज\s*[:：\-–—]/i;
const JABANI_RE = /^जबानी\s*[-–—:：]/i;

function isJabaniText(text) {
  return JABANI_RE.test(String(text || '').trim());
}

/** Move जबानी narration out of song paragraphs (legacy or mis-grouped). */
function partitionJabaniParagraphs(paragraphs) {
  const song = [];
  const jabaniParts = [];
  for (const p of paragraphs || []) {
    if (isJabaniText(p)) jabaniParts.push(String(p).trim());
    else if (String(p).trim()) song.push(p);
  }
  const jabani = jabaniParts.length ? jabaniParts.map(cleanAmbeLine).join('\n\n') : null;
  return { paragraphs: song, jabani };
}
const VISRAM_RE = /^[-:.\s]*विश्राम\s*[-:.\s]*$/i;
const TER_RE = /(?:॥\s*(?:टेर|तेर)\s*॥?|\|\|\s*(?:टेर|तेर)\s*\|\||\[टेर।?\]?)/i;
const NUMBERED_END_RE = /(?:॥\s*[०-९0-9]+\s*॥?|\|\|\s*[०-९0-9]+\s*\|\|)\s*$/;
const TRIPLET_HOOK_RE = /(?:^|\s)(?:हां\s+हां|जब\s+शंख|जै\s+जै\s+जै)/i;
const REFRAIN_TAIL_RE = /(?:जै\s+जै|जब\s+शंख)\s*$/i;

function rawLines(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !isJunkLine(l) && !VISRAM_RE.test(l));
}

function parsePreamble(lines) {
  let raga = null;
  let tarz = null;
  const proseIntro = [];
  const body = [];
  let i = 0;

  for (; i < lines.length; i += 1) {
    const line = lines[i];
    if (RAGA_RE.test(line)) {
      raga = line.replace(RAGA_RE, '').trim();
      continue;
    }
    if (TARZ_RE.test(line)) {
      tarz = line.replace(TARZ_RE, '').trim();
      continue;
    }
    if (!raga && !tarz && line.length > 72 && !TER_RE.test(line) && !NUMBERED_END_RE.test(line)) {
      proseIntro.push(line);
      continue;
    }
    break;
  }

  for (; i < lines.length; i += 1) body.push(lines[i]);

  const tarzField = formatTarzField(raga, tarz);
  return { raga, tarz, tarzField, proseIntro, body };
}

/** तर्ज text first; राग in parentheses when both present (001-style). */
function formatTarzField(raga, tarz) {
  if (tarz && raga) return `${tarz} (${raga})`;
  if (tarz) return tarz;
  if (raga) return raga;
  return null;
}

function splitJabani(lines) {
  const body = [];
  let jabani = null;
  for (const line of lines) {
    if (JABANI_RE.test(line)) jabani = line;
    else body.push(line);
  }
  return { body, jabani };
}

function joinLines(chunk) {
  return chunk.map(cleanAmbeLine).filter(Boolean).join('\n').trim();
}

function avgLen(lines) {
  if (!lines.length) return 0;
  return lines.reduce((s, l) => s + l.length, 0) / lines.length;
}

function countNumbered(lines) {
  return lines.filter((l) => NUMBERED_END_RE.test(l)).length;
}

function hasTer(lines) {
  return lines.some((l) => TER_RE.test(l));
}

function tripletHookHits(lines) {
  return lines.filter((l) => TRIPLET_HOOK_RE.test(l)).length;
}

function detectCharitraShape(body) {
  if (!body.length) return 'empty';

  const avg = avgLen(body);
  const numbered = countNumbered(body);
  const hooks = tripletHookHits(body);
  const ter = hasTer(body);

  if (hooks >= Math.max(2, Math.floor(body.length * 0.25))) {
    if (body.some((l) => /^हां\s+हां/i.test(l))) return 'stuti-haan-doha';
    if (body.some((l) => REFRAIN_TAIL_RE.test(l) || /जब\s+शंख/i.test(l))) return 'triplet-refrain';
  }

  if (avg > 95) return 'narrative-prose';

  if (numbered >= 2) {
    const short = body.filter((l) => l.length < 72);
    if (short.length >= numbered && avg < 75) return 'doha-numbered';
    if (avg < 85) return 'narrative-couplet';
    return 'narrative-numbered';
  }

  if (ter && avg > 70) return 'narrative-ter';

  if (avg < 72 && body.length >= 2) {
    const aarti = analyzeAartiConversion(body.join('\n'), '');
    if (aarti.stats.twoLineBlocks >= 1 && aarti.stats.multiLineBlocks === 0) return 'stuti-doha';
    return 'stuti-single';
  }

  return 'narrative-mixed';
}

function groupPairs(lines, startIdx) {
  const paras = [];
  for (let i = startIdx; i < lines.length; i += 2) {
    if (i + 1 < lines.length) paras.push(joinLines([lines[i], lines[i + 1]]));
    else paras.push(cleanAmbeLine(lines[i]));
  }
  return paras;
}

function groupNumberedCouplets(lines, startIdx) {
  const paras = [];
  let buf = [];
  for (let i = startIdx; i < lines.length; i += 1) {
    buf.push(lines[i]);
    if (NUMBERED_END_RE.test(lines[i])) {
      paras.push(joinLines(buf));
      buf = [];
    }
  }
  if (buf.length) paras.push(joinLines(buf));
  return paras;
}

function groupTripletRefrain(lines, startIdx) {
  const paras = [];
  let buf = [];
  for (let i = startIdx; i < lines.length; i += 1) {
    buf.push(lines[i]);
    if (NUMBERED_END_RE.test(lines[i]) || (buf.length >= 3 && REFRAIN_TAIL_RE.test(lines[i]))) {
      paras.push(joinLines(buf));
      buf = [];
    }
  }
  if (buf.length) paras.push(joinLines(buf));
  return paras;
}

function groupHaanDoha(lines, startIdx) {
  const paras = [];
  let buf = [];
  for (let i = startIdx; i < lines.length; i += 1) {
    buf.push(lines[i]);
    if (buf.length === 2 || NUMBERED_END_RE.test(lines[i])) {
      paras.push(joinLines(buf));
      buf = [];
    }
  }
  if (buf.length) paras.push(joinLines(buf));
  return paras;
}

function isNarrativeTerOpening(line) {
  if (!TER_RE.test(line)) return false;
  const cleaned = cleanAmbeLine(line);
  return cleaned.length > 48 || /राज्यभिषेक|समाज|कथा|बोल्यो|बोल उठ्यो/i.test(line);
}

function migrateCharitraBody(body, shape) {
  let sthayi = '';
  let sthayi_marker = null;
  let paragraphs = [];
  let startIdx = 0;

  const useTerOpen =
    shape.startsWith('narrative') || shape === 'doha-numbered'
      ? isNarrativeTerOpening(body[0])
      : false;

  if (useTerOpen) {
    sthayi = cleanAmbeLine(body[0]);
    sthayi_marker = 'टेर';
    startIdx = 1;
  }

  switch (shape) {
    case 'stuti-doha': {
      const converted = convertAartiCoupletLyrics(body.slice(startIdx).join('\n'), '');
      if (!sthayi) sthayi = converted.sthayi;
      else paragraphs.push(converted.sthayi);
      paragraphs = [...paragraphs, ...converted.paragraphs];
      break;
    }
    case 'stuti-haan-doha':
      if (!sthayi && body[0]) {
        sthayi = cleanAmbeLine(body[0]);
        startIdx = 1;
      }
      paragraphs = groupHaanDoha(body, startIdx);
      break;
    case 'triplet-refrain':
      paragraphs = groupTripletRefrain(body, startIdx);
      break;
    case 'narrative-couplet':
    case 'doha-numbered':
      paragraphs = groupNumberedCouplets(body, startIdx);
      if (!paragraphs.length) paragraphs = groupPairs(body, startIdx);
      break;
    case 'narrative-prose':
    case 'narrative-numbered':
    case 'narrative-ter':
    case 'narrative-mixed':
      paragraphs = body.slice(startIdx).map(cleanAmbeLine).filter(Boolean);
      break;
    case 'stuti-single':
      sthayi = cleanAmbeLine(body[0]);
      paragraphs = body.slice(1).map(cleanAmbeLine).filter(Boolean);
      break;
    default:
      paragraphs = body.slice(startIdx).map(cleanAmbeLine).filter(Boolean);
  }

  return { sthayi, sthayi_marker, paragraphs };
}

function migrateAmbikaCharitraDoc(doc) {
  const out = { ...doc };
  const raw = isStructuredLyrics(doc.lyrics)
    ? flattenLyricsText(doc.lyrics)
    : String(doc.lyrics || '');

  const lines = rawLines(cleanLyricsText(raw));
  if (!lines.length) {
    out.lyrics = { sthayi: '', paragraphs: [] };
    out._charitraShape = 'empty';
    return out;
  }

  const { body: jabSplit, jabani } = splitJabani(lines);
  const { tarzField, proseIntro, body } = parsePreamble(jabSplit);
  const shape = detectCharitraShape(body);

  if (tarzField) out.tarz = tarzField;

  const { sthayi, sthayi_marker, paragraphs } = migrateCharitraBody(body, shape);

  const allParas = [];
  if (proseIntro.length) allParas.push(joinLines(proseIntro));
  allParas.push(...paragraphs.filter(Boolean));

  const partitioned = partitionJabaniParagraphs(allParas);
  const narration = jabani ? cleanAmbeLine(jabani) : partitioned.jabani;

  out.lyrics = {
    sthayi: sthayi || '',
    ...(sthayi_marker ? { sthayi_marker } : {}),
    paragraphs: partitioned.paragraphs,
  };
  if (narration) out.jabani = narration;
  out._charitraShape = shape;
  return out;
}

function analyzeAmbikaCharitraMigration(backupDoc, currentDoc) {
  const proposed = migrateAmbikaCharitraDoc({ ...backupDoc });
  const shape = proposed._charitraShape;

  const flags = [];
  const lines = rawLines(
    cleanLyricsText(
      isStructuredLyrics(backupDoc.lyrics) ? flattenLyricsText(backupDoc.lyrics) : backupDoc.lyrics
    )
  );
  const { tarzField, proseIntro } = parsePreamble(lines);
  const { jabani } = splitJabani(lines);

  if (!tarzField && lines.some((l) => TARZ_RE.test(l) || RAGA_RE.test(l))) {
    flags.push('tarz-extract-failed');
  }
  if (proseIntro.length) flags.push('prose-intro');
  if (jabani) flags.push('has-jabani');
  if (proposed.lyrics.sthayi && TARZ_RE.test(proposed.lyrics.sthayi)) {
    flags.push('tarz-left-in-sthayi');
  }
  if (RAGA_RE.test(proposed.lyrics.sthayi || '')) flags.push('raga-left-in-sthayi');

  const multiline = (proposed.lyrics.paragraphs || []).filter((p) => String(p).includes('\n')).length;
  if (multiline) flags.push(`multiline-paragraphs:${multiline}`);

  const { body: verseLines } = parsePreamble(splitJabani(lines).body);
  const backupLineCount = verseLines.length;
  const proposedLineCount =
    (proposed.lyrics.sthayi ? proposed.lyrics.sthayi.split('\n').filter(Boolean).length : 0) +
    (proposed.lyrics.paragraphs || []).reduce(
      (n, p) => n + String(p).split('\n').filter(Boolean).length,
      0
    );

  let tier = 'high';
  let score = 85;
  const manualShapes = new Set(['narrative-mixed', 'narrative-prose', 'triplet-refrain']);
  if (manualShapes.has(shape)) score -= 12;
  if (flags.includes('tarz-left-in-sthayi')) score -= 20;
  if (flags.includes('prose-intro')) score -= 5;
  if (proposedLineCount < backupLineCount * 0.85) {
    flags.push('possible-content-loss');
    score -= 15;
  }
  if (shape === 'empty') {
    score = 0;
    tier = 'low';
  } else if (score < 60) tier = 'low';
  else if (score < 80) tier = 'medium';

  let currentShape = null;
  if (currentDoc?.lyrics && isStructuredLyrics(currentDoc.lyrics)) {
    const cp = currentDoc.lyrics.paragraphs || [];
    const multilineC = cp.filter((p) => String(p).includes('\n')).length;
    currentShape =
      multilineC >= 2 ? 'structured-multiline' : cp.length > 6 ? 'many-paragraphs' : 'structured';
  } else {
    currentShape = 'flat-legacy';
  }

  return {
    shape,
    score,
    tier,
    flags,
    tarz: proposed.tarz || null,
    backupLineCount,
    proposedLineCount,
    sthayiLines: (proposed.lyrics.sthayi || '').split('\n').filter(Boolean).length,
    paragraphCount: (proposed.lyrics.paragraphs || []).length,
    currentShape,
    manualReview: tier !== 'high' || flags.length > 2,
    proposed,
  };
}

function normalizeJabaniLyrics(lyrics) {
  if (!lyrics || typeof lyrics === 'string') return lyrics;

  const fixPart = (part) => {
    if (!part) return { part, jabani: null };
    const { paragraphs, jabani: fromParas } = partitionJabaniParagraphs(part.paragraphs);
    const cleaned = { ...part, paragraphs };
    delete cleaned.jabani;
    delete cleaned._legacyJabani;
    const merged = [part.jabani, part._legacyJabani, fromParas].filter(Boolean).join('\n\n').trim();
    return { part: cleaned, jabani: merged || null };
  };

  if (lyrics.parts?.length) {
    const jabaniParts = [];
    const parts = lyrics.parts.map((p) => {
      const { part, jabani } = fixPart(p);
      if (jabani) jabaniParts.push(jabani);
      return part;
    });
    return { lyrics: { ...lyrics, parts }, jabaniParts };
  }
  const { part, jabani } = fixPart(lyrics);
  return { lyrics: part, jabaniParts: jabani ? [jabani] : [] };
}

/** Move जबानी to doc root (not under lyrics). */
function normalizeJabaniDoc(doc) {
  const { lyrics, jabaniParts } = normalizeJabaniLyrics(doc.lyrics);
  const merged = [doc.jabani, ...jabaniParts].filter(Boolean).join('\n\n').trim();
  const out = { ...doc, lyrics };
  if (merged) out.jabani = merged;
  else delete out.jabani;
  return out;
}

module.exports = {
  migrateAmbikaCharitraDoc,
  analyzeAmbikaCharitraMigration,
  detectCharitraShape,
  parsePreamble,
  formatTarzField,
  isJabaniText,
  partitionJabaniParagraphs,
  normalizeJabaniLyrics,
  normalizeJabaniDoc,
  JABANI_RE,
};
