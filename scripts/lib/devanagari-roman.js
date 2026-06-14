/**
 * Devanagari → roman transliteration for bhajan titles (ITRANS-style, title case).
 * Initial values for romantitle; refine in admin as needed.
 */

const INDEP = {
  अ: 'a',
  आ: 'aa',
  इ: 'i',
  ई: 'ee',
  उ: 'u',
  ऊ: 'oo',
  ऋ: 'ri',
  ए: 'e',
  ऐ: 'ai',
  ओ: 'o',
  औ: 'au',
  अं: 'an',
  अः: 'ah',
  ऑ: 'o',
};

const CONS = {
  क: 'k',
  ख: 'kh',
  ग: 'g',
  घ: 'gh',
  ङ: 'ng',
  च: 'ch',
  छ: 'chh',
  ज: 'j',
  झ: 'jh',
  ञ: 'ny',
  ट: 't',
  ठ: 'th',
  ड: 'd',
  ढ: 'dh',
  ण: 'n',
  त: 't',
  थ: 'th',
  द: 'd',
  ध: 'dh',
  न: 'n',
  प: 'p',
  फ: 'ph',
  ब: 'b',
  भ: 'bh',
  म: 'm',
  य: 'y',
  र: 'r',
  ल: 'l',
  व: 'v',
  श: 'sh',
  ष: 'sh',
  स: 's',
  ह: 'h',
  क्ष: 'ksh',
  त्र: 'tr',
  ज्ञ: 'gy',
  ॐ: 'Om',
};

const MATRA = {
  'ा': 'aa',
  'ि': 'i',
  'ी': 'ee',
  'ु': 'u',
  'ू': 'oo',
  'ृ': 'ri',
  'े': 'e',
  'ै': 'ai',
  'ो': 'o',
  'ौ': 'au',
  'ं': 'n',
  'ः': 'h',
  '्': '',
  'ॅ': 'e',
  'ॉ': 'o',
};

const NUKT = { '़': '' };

function isDevanagari(ch) {
  const c = ch.codePointAt(0);
  return c >= 0x0900 && c <= 0x097f;
}

function titleCaseWord(w) {
  if (!w) return w;
  if (w === w.toUpperCase() && w.length > 1) return w;
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

function transliterateWord(word) {
  const chars = [...word.normalize('NFC')];
  let out = '';
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    if (!isDevanagari(ch)) {
      out += ch;
      i += 1;
      continue;
    }

    if (NUKT[ch] !== undefined) {
      i += 1;
      continue;
    }

    let cons = null;
    if (i + 1 < chars.length) {
      const pair = ch + chars[i + 1];
      if (CONS[pair]) {
        cons = pair;
        i += 2;
      }
    }
    if (!cons && CONS[ch]) {
      cons = ch;
      i += 1;
    }

    if (cons) {
      let vowel = 'a';
      if (i < chars.length && MATRA[chars[i]] !== undefined) {
        const m = MATRA[chars[i]];
        if (m === '') {
          vowel = '';
        } else {
          vowel = m;
        }
        i += 1;
      }
      out += CONS[cons] + vowel;
      continue;
    }

    if (INDEP[ch]) {
      out += INDEP[ch];
      i += 1;
      continue;
    }

    out += ch;
    i += 1;
  }
  return out.replace(/aa+/g, 'aa').replace(/([^aeiou])a\b/g, '$1');
}

/** Transliterate a Devanagari title to roman script (word title case). */
function devanagariToRoman(text) {
  return String(text || '')
    .split(/(\s+|[-–—,;:.!?()]+)/)
    .map((part) => {
      if (!part.trim() || !/[\u0900-\u097F]/.test(part)) return part;
      return titleCaseWord(transliterateWord(part));
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { devanagariToRoman, transliterateWord };
