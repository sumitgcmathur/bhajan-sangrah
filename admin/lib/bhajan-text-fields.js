const { isStructuredLyrics } = require('../../scripts/lib/lyrics-structure');

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

function replaceWordInText(text, word, replacement) {
  const target = normWord(word);
  if (!target) return { text: String(text || ''), count: 0 };
  let count = 0;
  const next = String(text || '').replace(/[\u0900-\u097F]+/gu, (raw) => {
    if (cleanSpellToken(raw) !== target) return raw;
    count += 1;
    return replacement;
  });
  return { text: next, count };
}

function collectFields(doc) {
  const out = [];
  if (doc.title) out.push({ field: 'title', text: String(doc.title) });
  if (doc.tarz) out.push({ field: 'tarz', text: String(doc.tarz) });
  if (doc.jabani) out.push({ field: 'jabani', text: String(doc.jabani) });

  const lyrics = doc.lyrics;
  if (!lyrics) return out;
  if (!isStructuredLyrics(lyrics)) {
    out.push({ field: 'lyrics', text: String(lyrics) });
    return out;
  }
  if (lyrics.tarz) out.push({ field: 'lyrics.tarz', text: String(lyrics.tarz) });
  if (lyrics.sthayi) out.push({ field: 'lyrics.sthayi', text: String(lyrics.sthayi) });
  if (lyrics.pre_shlok) out.push({ field: 'lyrics.pre_shlok', text: String(lyrics.pre_shlok) });
  if (lyrics.dhvani) out.push({ field: 'lyrics.dhvani', text: String(lyrics.dhvani) });
  const paras = lyrics.paragraphs || [];
  paras.forEach((p, i) => {
    if (p && typeof p === 'object' && p.commentary != null) {
      out.push({
        field: `lyrics.paragraphs[${i}]`,
        text: String(p.commentary),
        kind: 'commentary',
      });
    } else if (p != null) {
      out.push({ field: `lyrics.paragraphs[${i}]`, text: String(p), kind: 'antara' });
    }
  });
  return out;
}

function applyFieldToDoc(doc, field, text, kind) {
  if (field === 'title') doc.title = text;
  else if (field === 'tarz') doc.tarz = text || undefined;
  else if (field === 'jabani') doc.jabani = text || undefined;
  else if (field === 'lyrics') doc.lyrics = text;
  else if (field.startsWith('lyrics.')) {
    const lyrics = doc.lyrics;
    if (!lyrics || typeof lyrics !== 'object') return;
    if (field === 'lyrics.tarz') lyrics.tarz = text || undefined;
    else if (field === 'lyrics.sthayi') lyrics.sthayi = text || undefined;
    else if (field === 'lyrics.pre_shlok') lyrics.pre_shlok = text || undefined;
    else if (field === 'lyrics.dhvani') lyrics.dhvani = text || undefined;
    else {
      const m = field.match(/^lyrics\.paragraphs\[(\d+)\]$/);
      if (m) {
        const i = Number(m[1]);
        if (!lyrics.paragraphs) lyrics.paragraphs = [];
        lyrics.paragraphs[i] =
          kind === 'commentary' ? { commentary: text } : text;
      }
    }
  }
}

/** Replace whole Devanagari tokens matching `word` across all lyric fields. */
function replaceWordInDoc(doc, word, replacement) {
  const d = JSON.parse(JSON.stringify(doc));
  let total = 0;
  for (const { field, text, kind } of collectFields(d)) {
    const { text: next, count } = replaceWordInText(text, word, replacement);
    if (count) {
      applyFieldToDoc(d, field, next, kind);
      total += count;
    }
  }
  return { doc: d, count: total };
}

module.exports = {
  collectFields,
  replaceWordInDoc,
  cleanSpellToken,
};
