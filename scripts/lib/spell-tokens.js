/**
 * Strip danda / verse markers from Devanagari tokens before Hunspell lookup.
 * ॥ (U+0965) is inside the Devanagari block, so naive splits leave "धारा॥".
 */

function normWord(word) {
  return String(word || '').normalize('NFC');
}

function cleanSpellToken(word) {
  let w = normWord(word).trim();
  if (!w) return '';

  let prev;
  do {
    prev = w;
    w = w
      .replace(/^[।॥]+|[।॥]+$/gu, '')
      .replace(/^[\u0966-\u096F\d]+|[\u0966-\u096F\d]+$/gu, '')
      .replace(/^[\u200C\u200D]+|[\u200C\u200D]+$/gu, '')
      .replace(/^[\u0970-\u097F]+|[\u0970-\u097F]+$/gu, '');
  } while (w !== prev && w.length > 0);

  return w;
}

/** Split on non-Devanagari, then peel punctuation from each token. */
function tokenizeHindiForSpell(text, minLen = 2) {
  const out = [];
  for (const raw of String(text || '').split(/[^\u0900-\u097F]+/u)) {
    const w = cleanSpellToken(raw);
    if ([...w].length >= minLen) out.push(w);
  }
  return out;
}

/** Match Devanagari runs (used by spelling-variants corpus scan). */
function tokenizeHindiRuns(text, minLen = 2, maxLen = 48) {
  const re = /[\u0900-\u097F]+/gu;
  const words = [];
  let m;
  const s = String(text || '');
  while ((m = re.exec(s)) !== null) {
    const w = cleanSpellToken(m[0]);
    if (w.length >= minLen && w.length <= maxLen) words.push(w);
  }
  return words;
}

module.exports = {
  cleanSpellToken,
  tokenizeHindiForSpell,
  tokenizeHindiRuns,
};
