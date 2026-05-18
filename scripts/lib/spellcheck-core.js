const fs = require('fs');
const path = require('path');
const { DICTIONARY } = require('./paths');
const { loadSections, sectionFolder, listBhajanFiles, loadBhajan } = require('./sections');
const { flattenLyricsText } = require('./lyrics-structure');

const PUNCT_RE = /[।॥,\.;:!?'"()\[\]{}«»—–\-0-9]/g;
const QUOTE_TRIM_RE = /^[''""`´]+|[''""`´]+$/g;

function loadDictionary() {
  if (!fs.existsSync(DICTIONARY)) return new Set();
  return new Set(
    fs
      .readFileSync(DICTIONARY, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
  );
}

function normalizeToken(raw) {
  return String(raw).replace(QUOTE_TRIM_RE, '').trim();
}

function tokenize(text) {
  return String(text)
    .replace(PUNCT_RE, ' ')
    .split(/\s+/)
    .map(normalizeToken)
    .filter((w) => w.length > 1);
}

function bhajanTextFields(data) {
  const lyricsText =
    typeof data.lyrics === 'string' ? data.lyrics : flattenLyricsText(data.lyrics);
  return [
    { field: 'title', text: data.title || '' },
    { field: 'tarz', text: data.tarz || '' },
    { field: 'lyrics', text: lyricsText || '' },
    { field: 'dhvani', text: data.dhvani || '' },
    { field: 'jabani', text: data.jabani || '' },
  ].filter((f) => f.text.trim());
}

function snippetAround(text, word, max = 56) {
  const idx = text.indexOf(word);
  if (idx === -1) {
    const flat = text.replace(/\s+/g, ' ');
    return flat.length > max ? `${flat.slice(0, max)}…` : flat;
  }
  const start = Math.max(0, idx - 20);
  const end = Math.min(text.length, idx + word.length + 24);
  let s = text.slice(start, end).replace(/\s+/g, ' ').trim();
  if (start > 0) s = `…${s}`;
  if (end < text.length) s = `${s}…`;
  return s;
}

/** @returns {{ dictionary: string[], tokenCount: number, unknown: Array<{word,count,refs}> }} */
function collectSpellcheckData(dictInput) {
  const dict = dictInput instanceof Set ? dictInput : loadDictionary();
  const config = loadSections();
  const unknown = new Map();
  let tokenCount = 0;

  for (const section of config.sections) {
    for (const file of listBhajanFiles(section)) {
      const data = loadBhajan(path.join(sectionFolder(section), file));
      const rel = `${section.slug}/${file}`;

      for (const { field, text } of bhajanTextFields(data)) {
        for (const word of tokenize(text)) {
          tokenCount += 1;
          if (dict.has(word)) continue;

          if (!unknown.has(word)) unknown.set(word, { word, count: 0, refs: [] });
          const entry = unknown.get(word);
          entry.count += 1;

          const hasFile = entry.refs.some((r) => r.path === rel && r.field === field);
          if (!hasFile && entry.refs.length < 8) {
            entry.refs.push({
              path: rel,
              field,
              snippet: snippetAround(text, word),
            });
          }
        }
      }
    }
  }

  const unknownList = [...unknown.values()].sort((a, b) =>
    a.word.localeCompare(b.word, 'hi')
  );

  return {
    dictionary: [...dict].sort((a, b) => a.localeCompare(b, 'hi')),
    tokenCount,
    unknown: unknownList,
  };
}

function buildWordReplaceRegex(word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(^|[\\s।॥,;:!?'"()\\[\\]{}«»—–\\-])(${escaped})(?=[\\s।॥,;:!?'"()\\[\\]{}«»—–\\-]|$)`,
    'g'
  );
}

function replaceWordInText(text, from, to) {
  if (!from || from === to) return text;
  const re = buildWordReplaceRegex(from);
  return text.replace(re, `$1${to}`);
}

function applyDictionaryAdditions(words) {
  const existing = loadDictionary();
  const toAdd = words
    .map((w) => normalizeToken(w))
    .filter((w) => w.length > 1 && !existing.has(w));
  if (!toAdd.length) return 0;

  const unique = [...new Set(toAdd)].sort((a, b) => a.localeCompare(b, 'hi'));
  const block = unique.join('\n');
  const prefix = fs.existsSync(DICTIONARY) && fs.statSync(DICTIONARY).size > 0 ? '\n' : '';
  fs.appendFileSync(DICTIONARY, `${prefix}${block}\n`, 'utf8');
  return unique.length;
}

function applyReplacements(replacements) {
  const config = loadSections();
  const filesTouched = new Set();
  let totalHits = 0;

  for (const { from, to } of replacements) {
    const oldW = normalizeToken(from);
    const newW = normalizeToken(to);
    if (!oldW || oldW === newW) continue;

    for (const section of config.sections) {
      for (const file of listBhajanFiles(section)) {
        const filePath = path.join(sectionFolder(section), file);
        const raw = fs.readFileSync(filePath, 'utf8');
        const next = replaceWordInText(raw, oldW, newW);
        if (next !== raw) {
          fs.writeFileSync(filePath, next, 'utf8');
          filesTouched.add(filePath);
          const hits = (raw.match(buildWordReplaceRegex(oldW)) || []).length;
          totalHits += hits;
        }
      }
    }
  }

  return { filesTouched: filesTouched.size, totalHits };
}

module.exports = {
  loadDictionary,
  tokenize,
  normalizeToken,
  collectSpellcheckData,
  replaceWordInText,
  buildWordReplaceRegex,
  applyDictionaryAdditions,
  applyReplacements,
  DICTIONARY,
};
