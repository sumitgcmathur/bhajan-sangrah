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
  sanitizeLyricBlock,
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

  /** Scraped chorus echo on its own line, e.g. `॥ कृष्ण जिनका नाम है...॥` */
  function isQuatrainEchoLine(line) {
    const t = String(line || '').trim();
    if (!/^॥/.test(t)) return false;
    if (/\.{3,}|…/.test(t)) return true;
    const inner = t.replace(/^॥\s*/, '').replace(/॥\s*$/, '').trim();
    return inner.length < 52 && !/।/.test(inner);
  }

  function shouldUseQuatrainRefrain(lines) {
    const echoes = lines.filter(isQuatrainEchoLine).length;
    if (echoes < 2) return false;
    const content = lines.filter((l) => !isQuatrainEchoLine(l));
    if (content.length < 8 || content.length % 4 !== 0) return false;
    const closes = content.filter((l) => /प्रणाम है[।॥]?/i.test(l)).length;
    return closes >= 3;
  }

  /** Join scraped lines: newline after danda, comma only within a half-line couplet. */
  function joinVerseLines(lines) {
    const parts = lines.map((l) => cleanedLine(l)).filter(Boolean);
    if (!parts.length) return '';
    return parts.reduce((acc, part, i) => {
      if (i === 0) return part;
      if (/[।॥]\s*$/.test(acc)) return `${acc}\n${part}`;
      const left = acc.replace(/[,，\s]+$/u, '');
      const right = part.replace(/^[,，\s]+/u, '');
      return `${left}, ${right}`;
    });
  }

  function joinHalfLines(a, b) {
    const left = cleanedLine(a)
      .replace(/[।॥]\s*$/, '')
      .trim();
    if (!b) return cleanedLine(a);
    const right = cleanedLine(b);
    if (left.endsWith(',')) return `${left} ${right}`;
    return `${left}, ${right}`;
  }

  function formatQuatrainBlock(lines) {
    const rows = [];
    for (let i = 0; i < lines.length; i += 2) {
      rows.push(joinHalfLines(lines[i], lines[i + 1]));
    }
    return rows.join('\n');
  }

  function quatrainKey(quatrain) {
    return quatrain.map((l) => cleanedLine(l)).join('|');
  }

  /** Four-line antaras; omit standalone `॥ ……` echo lines between them. */
  function migrateQuatrainRefrain(lines) {
    if (!shouldUseQuatrainRefrain(lines)) return null;

    const quatrains = [];
    const content = lines.filter((l) => !isQuatrainEchoLine(l));
    for (let i = 0; i < content.length; i += 4) {
      quatrains.push(content.slice(i, i + 4));
    }
    if (quatrains.length < 2) return null;

    if (quatrains.length >= 6 && quatrainKey(quatrains[0]) === quatrainKey(quatrains[quatrains.length - 1])) {
      quatrains.pop();
    }

    return {
      strategy: 'quatrain-refrain',
      sthayi: formatQuatrainBlock(quatrains[0]),
      paragraphs: quatrains.slice(1).map(formatQuatrainBlock),
    };
  }

  function coupletPairKey(l1, l2) {
    return `${normKey(l1)}||${normKey(l2)}`;
  }

  function findRepeatingChorusCouplet(lines) {
    const counts = new Map();
    for (let i = 0; i < lines.length - 1; i += 2) {
      const k = coupletPairKey(lines[i], lines[i + 1]);
      if (k.length > 24) counts.set(k, (counts.get(k) || 0) + 1);
    }
    let best = null;
    let bestCount = 0;
    for (const [key, count] of counts) {
      if (count >= 3 && count > bestCount) {
        bestCount = count;
        best = key;
      }
    }
    return best;
  }

  function shouldUseChorusCouplet(lines) {
    if (shouldUseQuatrainRefrain(lines)) return false;
    if (shouldUseVerseEndStanzas(lines)) return false;
    return Boolean(findRepeatingChorusCouplet(lines));
  }

  /** Alternating chorus couplet + antara (e.g. Acchyutam Keshavam). */
  function migrateChorusCouplet(lines) {
    const chorusKey = findRepeatingChorusCouplet(lines);
    if (!chorusKey) return null;

    let sthayi = null;
    const body = [];
    for (let i = 0; i < lines.length; i += 1) {
      if (i + 1 < lines.length && coupletPairKey(lines[i], lines[i + 1]) === chorusKey) {
        if (!sthayi) sthayi = joinHalfLines(lines[i], lines[i + 1]);
        i += 1;
        continue;
      }
      body.push(lines[i]);
    }

    const paragraphs = [];
    for (let j = 0; j < body.length; j += 2) {
      paragraphs.push(joinHalfLines(body[j], body[j + 1]));
    }

    return {
      strategy: 'chorus-couplet',
      sthayi: sthayi || joinHalfLines(body[0], body[1]),
      paragraphs,
    };
  }

  function shouldUseNumberedCouplets(lines) {
    return lines.filter((l) => /॥\s*[०-९0-9]+\s*॥?/u.test(String(l))).length >= 3;
  }

  /** Two-line numbered stanzas (e.g. Madhuradhipate). */
  function migrateNumberedCouplets(lines) {
    if (!shouldUseNumberedCouplets(lines)) return null;

    const stanzas = [];
    for (let i = 0; i < lines.length; i += 2) {
      if (i + 1 < lines.length) stanzas.push(joinHalfLines(lines[i], lines[i + 1]));
      else stanzas.push(cleanedLine(lines[i]));
    }
    if (stanzas.length < 2) return null;

    return {
      strategy: 'numbered-couplets',
      sthayi: stanzas[0],
      paragraphs: stanzas.slice(1),
    };
  }

  function isHookEchoLine(line) {
    const t = String(line || '').trim();
    if (/\.{3,}|…/.test(t)) {
      const after = (t.match(/\.{3,}\s*(.+)$/u) || [])[1];
      if (after && after.trim().length > 0) return false;
      const before = t.replace(/\.{3,}.*$/u, '').trim();
      if (before.length < 42) return true;
      return false;
    }
    if (t.length < 36 && /^(हे\s+)?(गोविन्द|गोपाल)/i.test(t)) return true;
    return false;
  }

  function stripHookTail(line, hooks) {
    let s = cleanedLine(line);
    for (const hook of hooks) {
      const esc = hook.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      s = s.replace(new RegExp(`\\s*\\.{3,}\\s*${esc}.*$`, 'iu'), '');
    }
    return s.replace(/\s*\.{3,}.*$/u, '').trim();
  }

  function findEllipsisHooks(lines) {
    const hooks = [];
    for (const line of lines) {
      const m = String(line).match(/\.{3,}\s*(.+)$/u);
      if (m && m[1].trim().length >= 8) hooks.push(m[1].trim());
    }
    return [...new Set(hooks)];
  }

  function shouldUseHookSplit(lines) {
    const echoLines = lines.filter((l) => isHookEchoLine(l)).length;
    if (echoLines >= 2) return true;
    const hooks = findEllipsisHooks(lines);
    return hooks.length >= 2 && lines.filter((l) => /\.{3,}|…/.test(l)).length >= 2;
  }

  function shouldUseVerseEndStanzas(lines) {
    if (shouldUseQuatrainRefrain(lines) || shouldUseNumberedCouplets(lines)) return false;
    const ends = lines.filter((l) => /॥\s*$/.test(cleanedLine(l))).length;
    if (ends < 3) return false;
    const numbered = lines.filter((l) => /॥\s*[०-९0-9]/u.test(cleanedLine(l))).length;
    if (numbered >= 3) return false;
    return true;
  }

  /** Group lines into stanzas ending with ॥ (Hanuman bhajans, film bhajans). */
  function migrateVerseEndStanzas(lines) {
    if (!shouldUseVerseEndStanzas(lines)) return null;

    const blocks = [];
    let buf = [];
    for (const line of lines) {
      const c = cleanedLine(line);
      if (!c) continue;
      buf.push(line);
      if (/॥\s*$/.test(c)) {
        blocks.push(buf);
        buf = [];
      }
    }
    if (buf.length) blocks.push(buf);

    if (blocks.length < 2) return null;

    const fmt = (chunk) => sanitizeLyricBlock(joinVerseLines(chunk));
    return {
      strategy: 'verse-end-stanzas',
      sthayi: fmt(blocks[0]),
      paragraphs: blocks.slice(1).map(fmt),
    };
  }

  function formatLyricBlock(chunk) {
    const cleaned = chunk.map((l) => cleanedLine(l));
    if (!cleaned.length) return '';
    if (cleaned.length === 1) return cleaned[0];
    if (cleaned.length === 2) {
      const avg = (cleaned[0].length + cleaned[1].length) / 2;
      if (avg >= 38) return cleaned.join('\n');
      return joinHalfLines(cleaned[0], cleaned[1]);
    }
    if (cleaned.length === 3) {
      if (cleaned[0].length < 45) {
        return `${cleaned[0]}\n${joinHalfLines(cleaned[1], cleaned[2])}`;
      }
      return `${joinHalfLines(cleaned[0], cleaned[1])}\n${cleaned[2]}`;
    }
    const rows = [];
    for (let i = 0; i < cleaned.length; i += 2) {
      rows.push(joinHalfLines(cleaned[i], cleaned[i + 1] || ''));
    }
    return rows.join('\n');
  }

  /** Opening block + antaras; skip `...` chorus echo lines (Govind Gopal). */
  function migrateHookSplit(lines) {
    if (!shouldUseHookSplit(lines)) return null;

    const hooks = findEllipsisHooks(lines);
    const blocks = [];
    let buf = [];

    for (const line of lines) {
      if (isHookEchoLine(line)) {
        if (buf.length) {
          blocks.push(buf);
          buf = [];
        }
        continue;
      }
      const stripped = stripHookTail(line, hooks);
      if (stripped) buf.push(stripped);
    }
    if (buf.length) blocks.push(buf);

    if (blocks.length < 2) return null;

    return {
      strategy: 'hook-split',
      sthayi: formatLyricBlock(blocks[0]),
      paragraphs: blocks.slice(1).map(formatLyricBlock),
    };
  }

  function findTailRefrainPhrase(lines, title) {
    const titleKey = normKey(title || '');
    if (titleKey.length >= 8) {
      const titleHits = lines.filter((l) => normKey(l).includes(titleKey)).length;
      if (titleHits >= 3) return titleKey;
    }
    const tails = new Map();
    for (const line of lines) {
      const m = String(line).match(/,\s*([^,।॥|]{8,35})\s*[।॥]\s*$/u);
      if (m) {
        const t = normKey(m[1]);
        if (t.length >= 10) tails.set(t, (tails.get(t) || 0) + 1);
      }
    }
    let best = null;
    let bestCount = 0;
    for (const [t, count] of tails) {
      if (count >= 2 && count > bestCount) {
        bestCount = count;
        best = t;
      }
    }
    return best;
  }

  function lineEndsWithTailRefrain(line, phraseKey) {
    return normKey(line).includes(phraseKey);
  }

  function shouldUseTailRefrain(lines, title) {
    if (lines.filter((l) => isHookEchoLine(l)).length >= 2) return false;
    const phrase = findTailRefrainPhrase(lines, title);
    if (!phrase) return false;
    return lines.filter((l) => lineEndsWithTailRefrain(l, phrase)).length >= 2;
  }

  /** Narrative stanzas ending with a repeated tail refrain (Laj rakho Girdhari). */
  function migrateTailRefrain(lines, title) {
    const phraseKey = findTailRefrainPhrase(lines, title);
    if (!phraseKey) return null;

    let i = 0;
    const sthayiParts = [];
    for (; i < lines.length; i += 1) {
      const line = lines[i];
      if (/^जैसी|^सूरदास/i.test(line)) break;
      if (sthayiParts.length >= 2) break;
      if (sthayiParts.length && line.length > 85) break;
      sthayiParts.push(line);
    }
    const sthayi =
      sthayiParts.length >= 2
        ? joinHalfLines(sthayiParts[0], sthayiParts[1])
        : cleanedLine(sthayiParts[0] || '');

    const paragraphs = [];
    let buf = [];
    for (; i < lines.length; i += 1) {
      if (
        buf.length === 0 &&
        paragraphs.length > 0 &&
        lineEndsWithTailRefrain(lines[i], phraseKey) &&
        lines[i].length < 90
      ) {
        continue;
      }
      buf.push(lines[i]);
      if (lineEndsWithTailRefrain(lines[i], phraseKey)) {
        paragraphs.push(joinVerseLines(buf));
        buf = [];
      }
    }

    return {
      strategy: 'tail-refrain',
      sthayi,
      paragraphs,
    };
  }

  function detectInlineChorusTag(lines) {
    for (const line of lines) {
      const m = String(line).match(/।\s*([^\n।॥|]{8,40})\s*\.{3,}/u);
      if (m) return m[1].trim();
    }
    return null;
  }

  function shouldUseInlineChorusTag(lines) {
    const tag = detectInlineChorusTag(lines);
    if (!tag) return false;
    return lines.filter((l) => new RegExp(`।\\s*${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'iu').test(l)).length >= 2;
  }

  /** Strip inline `। chorus...` tails; sthayi + antaras (Dinan dukh haran). */
  function migrateInlineChorusTag(lines) {
    const tag = detectInlineChorusTag(lines);
    if (!tag) return null;

    const esc = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tagRe = new RegExp(`\\s*।\\s*${esc}.*?(?:\\.{3,}|$)`, 'iu');

    const sthayi = cleanedLine(String(lines[0]).replace(tagRe, '').trim());
    const paragraphs = [];
    let buf = [];
    const fmtVerse = (chunk) => chunk.map((l) => cleanedLine(l)).join('\n');
    for (let i = 1; i < lines.length; i += 1) {
      const line = lines[i];
      const cleaned = cleanedLine(String(line).replace(tagRe, '').trim());
      if (cleaned) buf.push(cleaned);
      if (tagRe.test(line)) {
        paragraphs.push(fmtVerse(buf));
        buf = [];
      }
    }
    if (buf.length) paragraphs.push(fmtVerse(buf));
    if (!paragraphs.length) return null;

    return {
      strategy: 'inline-chorus-tag',
      sthayi,
      paragraphs,
    };
  }

  function shouldUseInlineHookTail(lines) {
    if (lines.some((l) => isHookEchoLine(l))) return false;
    return (
      findEllipsisHooks(lines).length >= 1 &&
      lines.filter((l) => /\.{3,}|…/.test(l)).length >= 3
    );
  }

  /** Antaras split on `...hook` line endings (Tum mori rakho laj). */
  function migrateInlineHookTail(lines) {
    if (!shouldUseInlineHookTail(lines)) return null;

    const hooks = findEllipsisHooks(lines);
    const mainHook = hooks.sort((a, b) => b.length - a.length)[0] || '';
    const blocks = [];
    let buf = [];
    for (const line of lines) {
      const stripped = stripHookTail(line, hooks);
      if (stripped) buf.push(stripped);
      const endsHook =
        mainHook &&
        normKey(stripped).includes(normKey(mainHook)) &&
        /[।॥]\s*$/.test(stripped) &&
        !/\.{3,}|…/.test(line);
      if (/\.{3,}|…/.test(line) || (endsHook && buf.length >= 2 && blocks.length === 0)) {
        blocks.push(buf);
        buf = [];
      }
    }
    if (buf.length) blocks.push(buf);

    if (blocks.length < 2) return null;
    return {
      strategy: 'inline-hook-tail',
      sthayi: formatLyricBlock(blocks[0]),
      paragraphs: blocks.slice(1).map(formatLyricBlock),
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

  function detectShape(lines, title) {
    if (lines.length <= 1) return 'single';

    if (shouldUseQuatrainRefrain(lines)) return 'quatrain-refrain';
    if (shouldUseNumberedCouplets(lines)) return 'numbered-couplets';
    if (shouldUseVerseEndStanzas(lines)) return 'verse-end-stanzas';
    if (shouldUseChorusCouplet(lines)) return 'chorus-couplet';
    if (shouldUseInlineChorusTag(lines)) return 'inline-chorus-tag';
    if (shouldUseHookSplit(lines)) return 'hook-split';
    if (shouldUseInlineHookTail(lines)) return 'inline-hook-tail';
    if (shouldUseTailRefrain(lines, title)) return 'tail-refrain';

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

    const shape = detectShape(cleaned, title);

    if (shape === 'chorus-couplet') {
      const migrated = migrateChorusCouplet(cleaned);
      if (migrated) return migrated;
    }
    if (shape === 'numbered-couplets') {
      const migrated = migrateNumberedCouplets(cleaned);
      if (migrated) return migrated;
    }
    if (shape === 'verse-end-stanzas') {
      const migrated = migrateVerseEndStanzas(cleaned);
      if (migrated) return migrated;
    }
    if (shape === 'inline-chorus-tag') {
      const migrated = migrateInlineChorusTag(cleaned);
      if (migrated) return migrated;
    }
    if (shape === 'tail-refrain') {
      const migrated = migrateTailRefrain(cleaned, title);
      if (migrated) return migrated;
    }
    if (shape === 'hook-split') {
      const migrated = migrateHookSplit(cleaned);
      if (migrated) return migrated;
    }
    if (shape === 'inline-hook-tail') {
      const migrated = migrateInlineHookTail(cleaned);
      if (migrated) return migrated;
    }
    if (shape === 'couplets') {
      return migrateCouplets(cleaned);
    }
    if (shape === 'opening-antaras') {
      return migrateOpeningAntaras(cleaned);
    }
    if (shape === 'quatrain-refrain') {
      const migrated = migrateQuatrainRefrain(cleaned);
      if (migrated) return migrated;
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
    if (echoStanzas && !shouldUseQuatrainRefrain(cleaned)) return echoStanzas;

    const migrated = migrateAmbeLines(cleaned, title);
    if (migrated.strategy === 'refrain-blocks' && shouldUseQuatrainRefrain(cleaned)) {
      const fixed = migrateQuatrainRefrain(cleaned);
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
      sthayi: sanitizeLyricBlock(sthayi),
      paragraphs: paragraphs.filter(Boolean).map(sanitizeLyricBlock),
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
