const fs = require('fs');
const path = require('path');
const { ROOT } = require('./paths');
const { loadSections, sectionFolder, listBhajanFiles, loadBhajan } = require('./sections');
const { collectFields } = require('../../admin/lib/bhajan-text-fields');
const { tokenizeHindiForSpell } = require('./spell-tokens');

const ADMIN_PUBLIC = path.join(ROOT, 'admin', 'public');
const JSON_OUT = path.join(ADMIN_PUBLIC, 'sanskrit-dictionary.json');
const DIC_OUT = path.join(ADMIN_PUBLIC, 'sanskrit-words.dic');

/** Mantra section slug in content/sections.yaml */
const MANTRA_SECTION = 'mantra';

const SA_DIC_URL =
  'https://raw.githubusercontent.com/Shreeshrii/hindi-hunspell/master/Sanskrit/sa_IN.dic';

const MIN_WORD_LEN = 2;

/** Strip Hunspell flags; sa_IN.dic has invalid "word /5" lines for Espells + hi_IN.aff. */
function wordFromSaDicLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return null;
  const slash = trimmed.indexOf('/');
  const raw = slash >= 0 ? trimmed.slice(0, slash) : trimmed;
  const word = raw.trim();
  return word || null;
}

function parseSaDicText(text) {
  const lines = text.split(/\r?\n/);
  const words = new Set();
  for (let i = 1; i < lines.length; i += 1) {
    const word = wordFromSaDicLine(lines[i]);
    if (word) words.add(word);
  }
  return [...words].sort((a, b) => a.localeCompare(b, 'hi'));
}

function writeHunspellDic(words, destPath) {
  const body = [String(words.length), ...words].join('\n');
  fs.writeFileSync(destPath, `${body}\n`, 'utf8');
}

/** Devanagari tokens from content/mantra/ (Sanskrit stotras, Ved/Gita, etc.). */
function collectMantraWords(config = loadSections()) {
  const words = new Set();
  const mantraSection = (config.sections || []).find((s) => s.slug === MANTRA_SECTION);
  if (!mantraSection) return words;

  for (const file of listBhajanFiles(mantraSection)) {
    const doc = loadBhajan(path.join(sectionFolder(mantraSection), file));
    for (const { text } of collectFields(doc)) {
      for (const w of tokenizeHindiForSpell(text, MIN_WORD_LEN)) {
        words.add(w);
      }
    }
  }
  return words;
}

/** Build word-only Sanskrit list from upstream sa_IN.dic + mantra section corpus. */
async function writeSanskritDictionary() {
  const res = await fetch(SA_DIC_URL);
  if (!res.ok) throw new Error(`Failed to fetch sa_IN.dic: HTTP ${res.status}`);
  const text = await res.text();
  const upstreamWords = parseSaDicText(text);
  const mantraWords = collectMantraWords();
  const merged = new Set([...upstreamWords, ...mantraWords]);
  const words = [...merged].sort((a, b) => a.localeCompare(b, 'hi'));

  fs.mkdirSync(ADMIN_PUBLIC, { recursive: true });

  const payload = {
    generated: new Date().toISOString(),
    source: SA_DIC_URL,
    upstreamWords: upstreamWords.length,
    mantraSectionWords: mantraWords.size,
    uniqueWords: words.length,
    words,
  };
  fs.writeFileSync(JSON_OUT, `${JSON.stringify(payload)}\n`, 'utf8');
  writeHunspellDic(words, DIC_OUT);

  console.log(
    `Sanskrit dictionary: ${words.length} words (${mantraWords.size} from mantra section) → ${DIC_OUT}`,
  );

  return { words, jsonPath: JSON_OUT, dicPath: DIC_OUT };
}

module.exports = {
  SA_DIC_URL,
  MANTRA_SECTION,
  wordFromSaDicLine,
  parseSaDicText,
  collectMantraWords,
  writeSanskritDictionary,
  JSON_OUT,
  DIC_OUT,
};
