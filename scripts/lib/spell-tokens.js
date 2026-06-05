/** Devanagari token helpers (shared by corpus-dict build and admin spell-tokens.js). */

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

function tokenizeHindiForSpell(text, minLen = 2) {
  const out = [];
  for (const raw of String(text || '').split(/[^\u0900-\u097F]+/u)) {
    const w = cleanSpellToken(raw);
    if ([...w].length >= minLen) out.push(w);
  }
  return out;
}

module.exports = {
  normWord,
  cleanSpellToken,
  tokenizeHindiForSpell,
};
