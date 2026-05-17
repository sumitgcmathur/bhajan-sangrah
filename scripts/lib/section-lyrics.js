/**
 * Shared migration: ganpati/horiya-style hooks + ambe shapes (flat scraped → sthayi + paragraphs).
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

function createSectionMigrator(options = {}) {
  const CHORUS_HOOKS = options.chorusHooks || [];
  const strategyField = options.strategyField || '_sectionStrategy';

  function preprocessLine(line) {
    let s = decodeHtmlEntities(line);
    s = s.replace(/।।\s*टेर\s*।+[l|]?/gi, '॥टेर॥');
    s = s.replace(/।\s*टेर\s*।+/gi, '॥टेर॥');
    s = s.replace(/\|\|\s*([०-९0-9]+)\s*\|\|/gi, '॥$1॥');
    s = s.replace(/।।\s*([०-९0-9]+)\s*।।/gi, '॥$1॥');
    s = s.replace(/\s*\.{2,}\s*(?=॥\s*[०-९0-9])/g, ' ');
    if (/॥\s*[०-९0-9]/.test(s)) {
      s = s.replace(/\s*\.{2,}/g, ' ');
    }
    return s.replace(/\s+/g, ' ').trim();
  }

  function cleanedLine(line) {
    return cleanAmbeLine(preprocessLine(line));
  }

  /** Scraped shorthand: `, <refrain>...` at end of a short couplet line */
  function hasCommaEllipsisRefrain(line) {
    return /,\s*[^,।॥|]{6,}\s*\.{3,}\s*$/u.test(String(line || ''));
  }

  function shouldUseCouplets(lines) {
    if (lines.length < 4) return false;
    const avg = lines.reduce((s, l) => s + l.length, 0) / lines.length;
    if (avg > 100) return false;
    return lines.filter(hasCommaEllipsisRefrain).length >= 2;
  }

  function shouldUseOpeningAntaras(lines) {
    if (lines.length < 3) return false;
    const ellipsisLines = lines.filter((l) => /\.{3,}/.test(l)).length;
    if (ellipsisLines < 2) return false;
    const avg = lines.reduce((s, l) => s + l.length, 0) / lines.length;
    return avg >= 65;
  }

  function findSthayiEndIndex(lines) {
    for (let i = 0; i < Math.min(5, lines.length); i += 1) {
      const c = cleanedLine(lines[i]);
      if (/॥\s*$/.test(c) && i >= 1) return i + 1;
      if (/[|]{2}\s*$/.test(String(lines[i]).trim()) && i >= 1) return i + 1;
    }
    return Math.min(2, lines.length);
  }

  function migrateCouplets(lines) {
    let sthayiEnd = 1;
    if (lines.length > 3 && !hasCommaEllipsisRefrain(lines[1]) && !/\.{3,}/.test(lines[1])) {
      sthayiEnd = 2;
    }
    const sthayi = joinLines(lines.slice(0, sthayiEnd));
    const rest = lines.slice(sthayiEnd);
    const paragraphs = [];
    for (let i = 0; i < rest.length; i += 2) {
      if (i + 1 < rest.length) paragraphs.push(joinLines([rest[i], rest[i + 1]]));
      else paragraphs.push(cleanedLine(rest[i]));
    }
    return { strategy: 'couplets', sthayi, paragraphs };
  }

  function migrateOpeningAntaras(lines) {
    const sthayiEnd = findSthayiEndIndex(lines);
    return {
      strategy: 'opening-antaras',
      sthayi: joinLines(lines.slice(0, sthayiEnd)),
      paragraphs: lines.slice(sthayiEnd).map((l) => cleanedLine(l)).filter(Boolean),
    };
  }

  /** Quatrain + `॥ …` echo lines (e.g. Krishna film bhajans). */
  function migrateEchoStanzas(lines) {
    const echoCount = lines.filter((l) => /^॥/.test(String(l).trim())).length;
    if (echoCount < 2) return null;

    const chunks = [];
    let buf = [];
    for (const line of lines) {
      buf.push(line);
      if (/^॥/.test(String(line).trim())) {
        chunks.push(joinLines(buf));
        buf = [];
      }
    }
    if (buf.length) chunks.push(joinLines(buf));
    if (chunks.length < 2) return null;

    return {
      strategy: 'echo-stanzas',
      sthayi: chunks[0],
      paragraphs: chunks.slice(1),
    };
  }

  function rawLines(text) {
    return String(text || '')
      .split('\n')
      .map((l) => preprocessLine(l))
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
    return CHORUS_HOOKS.some((h) => {
      const idx = s.lastIndexOf(h);
      return idx >= 0 && idx >= s.length - h.length - 4;
    });
  }

  function endsWithHook(line) {
    const s = cleanedLine(line);
    if (HOOK_TAIL_RE.test(s)) return true;
    if (lineEndsWithChorusPhrase(s)) return true;
    if (/\.\.\./.test(s) && /(?:रे|रो|रा|जी|है|हो|खेलो|होरी|नाम)\s*\.{2,}\s*$/iu.test(s)) return true;
    if (/\.\.\.\s*[^.]+\s*(?:\|\||॥)\s*$/u.test(s)) return true;
    if (
      CHORUS_HOOKS.some(
        (h) => s.includes(h) && (/(?:॥|\||।)\s*$/u.test(s) || /\.\.\./.test(s))
      )
    ) {
      return true;
    }
    return false;
  }

  function detectAutoChorusHook(lines) {
    const seed = String(lines[0] || '').trim();
    if (seed.length < 14) return null;
    const key = seed.slice(0, Math.min(28, seed.length));
    const hits = lines.filter((l) => String(l).includes(key)).length;
    return hits >= 3 ? seed : null;
  }

  function detectChorusHook(lines) {
    for (const hook of CHORUS_HOOKS) {
      const hits = lines.filter((l) => String(l).includes(hook)).length;
      if (hits >= 2) return hook;
    }
    return detectAutoChorusHook(lines);
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
    while (i < lines.length && i < 4) {
      if (endsWithHook(lines[i])) {
        sthayiParts.push(lines[i]);
        i += 1;
        break;
      }
      sthayiParts.push(lines[i]);
      i += 1;
    }

    const paragraphs = [];
    let buf = [];
    for (; i < lines.length; i += 1) {
      const longLine = String(lines[i]).length >= 70;
      if (longLine && buf.length) {
        paragraphs.push(joinLines(buf));
        buf = [];
      }
      buf.push(lines[i]);
      if (endsWithHook(lines[i]) || longLine) {
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

  function detectShape(lines) {
    if (lines.length <= 1) return 'single';

    if (shouldUseCouplets(lines)) return 'couplets';
    if (shouldUseOpeningAntaras(lines)) return 'opening-antaras';

    const ambeShape = detectAmbeShape(lines);
    if (
      ambeShape === 'numbered-stanzas' ||
      ambeShape === 'ellipsis-stanzas' ||
      ambeShape === 'ter-split' ||
      ambeShape === 'ter-split-triple' ||
      ambeShape === 'chorus-quad'
    ) {
      return ambeShape;
    }

    const hookLines = lines.filter((l) => endsWithHook(l)).length;
    if (hookLines >= 2) return 'hook-stanzas';

    const chorusHook = detectChorusHook(lines);
    if (chorusHook && !String(lines[0] || '').includes(chorusHook)) {
      return { type: 'chorus-hook', hook: chorusHook };
    }

    const refrainKey = findRepeatingRefrain(lines, 1);
    if (refrainKey) {
      const body = lines.slice(1);
      const hits = body.filter((l) => lineMatchesRefrain(l, refrainKey)).length;
      if (hits >= Math.max(2, Math.ceil(body.length * 0.5))) {
        if (ambeShape === 'refrain-blocks' || String(ambeShape).startsWith('refrain-every-')) {
          return ambeShape;
        }
        const avgLen = body.reduce((s, l) => s + l.length, 0) / Math.max(1, body.length);
        if (avgLen >= 55 || body.every((l) => l.length >= 45)) return 'refrain-line';
      }
    }

    if (ambeShape === 'pairs' || ambeShape === 'ter-single') {
      const body = lines.slice(1);
      if (body.length >= 3 && body.every((l) => l.length >= 45)) return 'refrain-line';
    }
    return ambeShape;
  }

  function migrateLines(lines, title) {
    const cleaned = lines.map(preprocessLine).filter(Boolean);
    if (!cleaned.length) {
      return { strategy: 'empty', sthayi: '', paragraphs: [] };
    }

    const shape = detectShape(cleaned);

    if (shape === 'couplets') {
      return migrateCouplets(cleaned);
    }
    if (shape === 'opening-antaras') {
      return migrateOpeningAntaras(cleaned);
    }
    if (shape === 'hook-stanzas') {
      return migrateHookStanzas(cleaned);
    }
    if (shape && typeof shape === 'object' && shape.type === 'chorus-hook') {
      return migrateChorusHookStanzas(cleaned, shape.hook);
    }
    if (shape === 'refrain-line') {
      return migrateRefrainLines(cleaned);
    }

    const echoStanzas = migrateEchoStanzas(cleaned);
    if (echoStanzas) return echoStanzas;

    const migrated = migrateAmbeLines(cleaned, title);
    if (migrated.strategy === 'refrain-blocks') {
      const fixed = migrateEchoStanzas(cleaned);
      if (fixed) return fixed;
    }
    const structuredRefrain =
      migrated.strategy === 'refrain-blocks' ||
      String(migrated.strategy).startsWith('refrain-every-') ||
      migrated.strategy === 'numbered-stanzas' ||
      migrated.strategy === 'ellipsis-stanzas';
    if (structuredRefrain) return migrated;

    const tailKey = findRepeatingRefrain(cleaned, 1);
    const tailHits = tailKey
      ? cleaned.slice(1).filter((l) => lineMatchesRefrain(l, tailKey)).length
      : 0;
    const allSingleLineParas = (migrated.paragraphs || []).every(
      (p) => !String(p).includes('\n')
    );
    if (
      tailHits >= 3 &&
      allSingleLineParas &&
      (migrated.strategy === 'pairs' || migrated.strategy === 'ter-single' || migrated.strategy === 'single')
    ) {
      return migrateRefrainLines(cleaned);
    }
    return migrated;
  }

  function migrateDoc(doc) {
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
      out[strategyField] = 'empty';
      return out;
    }

    const { strategy, sthayi, paragraphs } = migrateLines(lines, out.title || doc.title || '');
    out.lyrics = {
      sthayi,
      paragraphs: paragraphs.filter(Boolean),
    };
    out[strategyField] = strategy;
    return out;
  }

  return {
    migrateDoc,
    migrateLines,
    preprocessLine,
    strategyField,
  };
}

const defaultMigrator = createSectionMigrator();

module.exports = {
  createSectionMigrator,
  migrateSectionDoc: defaultMigrator.migrateDoc,
  migrateSectionLines: defaultMigrator.migrateLines,
  preprocessSectionLine: defaultMigrator.preprocessLine,
};
