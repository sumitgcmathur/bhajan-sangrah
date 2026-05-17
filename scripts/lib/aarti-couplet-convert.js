/**
 * Convert legacy aarti text into sthayi + paragraphs (simple 2-line block model).
 * Unsupported patterns are reported via analyzeAartiConversion() — do not auto-write.
 */
const { cleanLyricsText, isJunkLine } = require('./clean-lyrics');
const { stripVerseNumbers } = require('./lyrics-structure');

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

function norm(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .replace(/[॥|]/g, '')
    .trim();
}

function deriveHookPhrases(title, rawText) {
  const phrases = new Set();
  const add = (s) => {
    const t = String(s || '').trim();
    if (!t) return;
    phrases.add(t);
    const comma = t.indexOf(',');
    if (comma > 0) phrases.add(t.slice(0, comma).trim());
  };
  add(title);
  for (const line of linesOf(rawText).slice(0, 2)) add(line.split(',')[0]);
  return [...phrases].filter((p) => p.length >= 8);
}

function isRefrainLine(line, hookPhrases) {
  const t = String(line || '').trim();
  if (!t) return true;
  if (/\.\.\./.test(t)) return true;
  if (/^॥\s*.+\.\./.test(t)) return true;

  const core = lyricCore(line);
  // Verse lines with a comma are never standalone refrains
  if (core.includes(',')) return false;

  const b = norm(core);
  for (const hook of hookPhrases) {
    const h = norm(hook);
    if (!h) continue;
    if (b === h) return true;
    const short = norm(hook.split(',')[0]);
    if (short.length >= 10 && b === short) return true;
  }
  return false;
}

function lyricCore(line) {
  return stripVerseNumbers(String(line || ''))
    .replace(/[।॥]+\s*$/u, '')
    .trim();
}

function withDanda(line, danda) {
  let core = lyricCore(line);
  if (!core) return '';
  core = core.replace(/[,，]\s*$/, '').trim();
  if (danda === '।' && /।$/.test(core)) return core;
  if (danda === '॥' && /॥$/.test(core)) return core;
  return `${core}${danda}`;
}

function formatCouplet(lineA, lineB) {
  return `${withDanda(lineA, '।')}\n${withDanda(lineB, '॥')}`;
}

function formatStanzaLines(lines) {
  if (!lines.length) return null;
  if (lines.length === 1) return withDanda(lines[0], '।');
  if (lines.length === 2) return formatCouplet(lines[0], lines[1]);
  return lines
    .map((l, i) => (i < lines.length - 1 ? withDanda(l, '।') : withDanda(l, '॥')))
    .join('\n');
}

function stanzaFromBlock(blockText, hookPhrases) {
  const lines = linesOf(blockText).filter((l) => !isRefrainLine(l, hookPhrases));
  return formatStanzaLines(lines);
}

function stanzasSimilar(a, b) {
  const x = norm(a.replace(/\n/g, ' '));
  const y = norm(b.replace(/\n/g, ' '));
  if (!x || !y) return false;
  return x === y || x.startsWith(y.slice(0, 35)) || y.startsWith(x.slice(0, 35));
}

function countYamlLines(sthayi, paragraphs) {
  let n = 0;
  if (sthayi) n += sthayi.split('\n').filter((l) => l.trim()).length;
  for (const p of paragraphs || []) {
    n += String(p).split('\n').filter((l) => l.trim()).length;
  }
  return n;
}

/**
 * Inspect backup text; returns whether auto-convert is safe and why not.
 * @returns {{ autoSafe: boolean, issues: Array<{code:string,detail:string}>, converted, stats }}
 */
function analyzeAartiConversion(rawLyrics, title = '') {
  const issues = [];
  const cleaned = cleanLyricsText(rawLyrics);
  const hookPhrases = deriveHookPhrases(title, cleaned);
  const blocks = splitBlocks(cleaned);

  let inputLines = 0;
  let twoLineBlocks = 0;
  let multiLineBlocks = 0;
  let singleLineBlocks = 0;
  let chorusSkips = 0;
  const stanzas = [];
  let openingStanza = null;

  for (const block of blocks) {
    const lines = linesOf(block).filter((l) => !isRefrainLine(l, hookPhrases));
    inputLines += lines.length;
    if (lines.length === 1) singleLineBlocks += 1;
    else if (lines.length === 2) twoLineBlocks += 1;
    else if (lines.length > 2) multiLineBlocks += 1;

    const stanza = stanzaFromBlock(block, hookPhrases);
    if (!stanza) continue;
    if (openingStanza && stanzasSimilar(stanza, openingStanza)) {
      chorusSkips += 1;
      continue;
    }
    stanzas.push(stanza);
    if (!openingStanza) openingStanza = stanza;
  }

  const converted = convertAartiCoupletLyrics(rawLyrics, title);
  const outputLines = countYamlLines(converted.sthayi, converted.paragraphs);

  if (multiLineBlocks > 0) {
    issues.push({
      code: 'multiline-blocks',
      detail: `${multiLineBlocks} stanza block(s) have more than 2 lines — needs custom layout`,
    });
  }

  if (chorusSkips > 0) {
    issues.push({
      code: 'repeated-chorus',
      detail: `${chorusSkips} repeated chorus block(s) — may need pairing (e.g. जय गणेश)`,
    });
  }

  if (chorusSkips > 0 && twoLineBlocks >= 3) {
    issues.push({
      code: 'needs-block-pairing',
      detail:
        'consecutive 2-line blocks should merge into one paragraph (comma-joined lines)',
    });
  }

  if (outputLines > 0 && inputLines > 0 && outputLines < inputLines * 0.92) {
    issues.push({
      code: 'content-loss',
      detail: `would keep ${outputLines} of ${inputLines} content lines in YAML`,
    });
  }

  if (converted.sthayi && converted.sthayi.split('\n').filter(Boolean).length > 3) {
    issues.push({
      code: 'long-sthayi',
      detail: 'स्थाई would exceed 3 lines — likely merged a long stanza incorrectly',
    });
  }

  const autoSafe = issues.length === 0;

  return {
    autoSafe,
    issues,
    converted,
    stats: {
      blocks: blocks.length,
      inputLines,
      outputLines,
      twoLineBlocks,
      multiLineBlocks,
      singleLineBlocks,
      chorusSkips,
      stanzaCount: stanzas.length,
    },
  };
}

/**
 * @param {string} rawLyrics
 * @param {string} [title]
 * @returns {{ sthayi: string, paragraphs: string[] }}
 */
function convertAartiCoupletLyrics(rawLyrics, title = '') {
  const cleaned = cleanLyricsText(rawLyrics);
  const hookPhrases = deriveHookPhrases(title, cleaned);
  const blocks = splitBlocks(cleaned);
  const stanzas = [];
  let openingStanza = null;

  for (const block of blocks) {
    const stanza = stanzaFromBlock(block, hookPhrases);
    if (!stanza) continue;
    if (openingStanza && stanzasSimilar(stanza, openingStanza)) {
      continue;
    }
    stanzas.push(stanza);
    if (!openingStanza) openingStanza = stanza;
  }

  if (!stanzas.length) return { sthayi: '', paragraphs: [] };

  let sthayi = stanzas[0];
  let rest = stanzas.slice(1);

  if (rest.length && !sthayi.includes('\n') && rest[0].includes('\n')) {
    const first = sthayi.replace(/॥$/, '').replace(/।$/, '');
    sthayi = `${first}।\n${rest[0]}`;
    rest = rest.slice(1);
  }

  return { sthayi, paragraphs: rest };
}

module.exports = {
  analyzeAartiConversion,
  convertAartiCoupletLyrics,
  formatCouplet,
  formatStanzaLines,
  stanzaFromBlock,
};
