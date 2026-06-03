/**
 * Hindi Hunspell checker (Espells + dictionary-hi via CDN).
 * Loaded once per server instance; first request may take ~10–20s.
 */
const DICT_AFF =
  'https://cdn.jsdelivr.net/npm/dictionary-hi@2/index.aff';
const DICT_DIC =
  'https://cdn.jsdelivr.net/npm/dictionary-hi@2/index.dic';

const MIN_WORD_LEN = 2;
const MAX_SUGGESTIONS = 6;

/** Words often valid in bhajans but absent from general Hindi dictionaries */
const DEFAULT_IGNORE = new Set([
  'टेर',
  'तेर',
  'स्थायी',
  'अंतरा',
  'तर्ज',
  'जबानी',
  'ध्वनि',
  'श्लोक',
  'श्लोका',
  'श्लोकम्',
  'श्री',
  'श्रीमती',
  'श्रीमान',
  'शुंभ',
  'निशुंभ',
  'शुम्भ',
  'निशुम्भ',
  'कालिका',
  'अंबिका',
  'जगदम्बे',
  'जगदम्बा',
  'भवानी',
  'भवानीजी',
  'देवी',
  'देवीजी',
  'महाराज',
  'महाराजा',
  'महारानी',
  'दैत्य',
  'दानव',
  'राक्षस',
  'ब्रह्माजी',
  'भृगुजी',
  'तथास्तु',
  'कछु',
  'कछ',
]);

let checker = null;
let loadError = null;
let loadPromise = null;
let EspellsClass = null;

async function loadEspells() {
  if (EspellsClass) return EspellsClass;
  try {
    const mod = await import('espells');
    EspellsClass = mod.Espells;
    if (!EspellsClass) throw new Error('Espells export missing');
    return EspellsClass;
  } catch (e) {
    const detail = e?.message || String(e);
    throw new Error(`Spell checker failed to load (espells): ${detail}`);
  }
}

function tokenize(text) {
  const re = /[\u0900-\u097F]+/gu;
  const words = [];
  let m;
  while ((m = re.exec(String(text || ''))) !== null) {
    const w = m[0];
    if (w.length >= MIN_WORD_LEN) words.push(w);
  }
  return words;
}

function shouldSkip(word, extraIgnore) {
  if (DEFAULT_IGNORE.has(word)) return true;
  if (extraIgnore && extraIgnore.has(word)) return true;
  if (/^[०१२३४५६७८९\d]+$/.test(word)) return true;
  return false;
}

async function getChecker() {
  if (checker) return checker;
  if (loadError) throw loadError;
  if (!loadPromise) {
    loadPromise = (async () => {
      const Espells = await loadEspells();
      checker = await Espells.fromURL({ aff: DICT_AFF, dic: DICT_DIC });
      return checker;
    })().catch((e) => {
      loadError = e;
      loadPromise = null;
      throw e;
    });
  }
  return loadPromise;
}

/**
 * @param {Array<{ id: string, label: string, text: string }>} texts
 * @param {string[]} ignoreWords
 */
async function checkTexts(texts, ignoreWords = []) {
  const spell = await getChecker();
  const extraIgnore = new Set((ignoreWords || []).map((w) => String(w).trim()).filter(Boolean));
  const fields = [];
  let totalIssues = 0;

  for (const { id, label, text } of texts) {
    const issues = [];
    const seen = new Set();
    for (const word of tokenize(text)) {
      if (seen.has(word)) continue;
      seen.add(word);
      if (shouldSkip(word, extraIgnore)) continue;

      const { correct, forbidden } = spell.lookup(word);
      if (correct && !forbidden) continue;

      const suggestions = spell.suggest(word).slice(0, MAX_SUGGESTIONS);
      issues.push({ word, suggestions });
      totalIssues += 1;
    }
    if (issues.length) fields.push({ id, label, issues });
  }

  return { fields, totalIssues, ready: true };
}

module.exports = { checkTexts, tokenize, DEFAULT_IGNORE };
