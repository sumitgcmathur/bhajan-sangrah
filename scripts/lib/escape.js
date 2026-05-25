const {
  isStructuredLyrics,
  isMultilineParagraph,
  toDevaNum,
  normalizeFromLegacy,
} = require('./lyrics-structure');

const STHAYI_MARKER = ' ॥स्थायी॥';
const STHAYI_CONNECT_TAIL = '....';
const STHAYI_CONNECT_MAX_WORDS = 5;
const JABANI_RE = /^जबानी\s*[-–—:：]/i;

function isJabaniText(text) {
  return JABANI_RE.test(String(text || '').trim());
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMarker(n) {
  return `|| ${toDevaNum(n)} ||`;
}

function formatDandaVerse(n) {
  return ` ॥${toDevaNum(n)}॥`;
}

function isRefrainLine(line) {
  const t = String(line || '').trim();
  // Inline sthayi-connect tails end with ... but are full antara lines, not standalone refrains.
  if (t.includes(STHAYI_CONNECT_TAIL)) return false;
  return /\.\.\.\s*॥?\s*$/.test(t) || (t.endsWith('..') && t.length < 48);
}

function lineWithoutEndDanda(line) {
  return String(line || '')
    .trim()
    .replace(/[।॥]+\s*$/u, '')
    .trim();
}

/**
 * Render a multiline block like an antara; last line gets endMarker or ॥n॥.
 * @param {string[]} lines
 * @param {{ verseNum?: number, endMarker?: string }} opts
 */
function renderBlockLines(lines, opts = {}) {
  if (!lines.length) return { html: '', nextVerse: opts.verseNum ?? 1 };

  const out = [];
  let n = opts.verseNum ?? 1;
  const couplet = lines.length >= 2;
  const fixedMarker = opts.endMarker;

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    if (isRefrainLine(t)) {
      out.push(`<span class="lyrics-refrain">${escapeHtml(t)}</span>`);
      continue;
    }

    const isLast = i === lines.length - 1;
    const tagLast = (couplet && isLast) || (!couplet && i === 0);

    if (tagLast) {
      const core = lineWithoutEndDanda(t);
      const marker = fixedMarker != null ? fixedMarker : formatDandaVerse(n);
      out.push(
        `<span class="lyrics-line">${escapeHtml(core)}<span class="lyrics-marker">${escapeHtml(marker)}</span></span>`
      );
      if (!fixedMarker) n += 1;
    } else {
      out.push(`<span class="lyrics-line">${escapeHtml(t)}</span>`);
    }
  }

  return { html: out.join('\n'), nextVerse: n };
}

function lyricsAntaraStripeClass(verseNum) {
  return verseNum % 2 === 1 ? 'lyrics-antara--odd' : 'lyrics-antara--even';
}

function isSthayiConnectEnabled(part) {
  if (part?.sthayi_connect === false || part?.sthayi_connect === 'false') return false;
  if (part?.sthayi_connect === true || part?.sthayi_connect === 'true') return true;
  return false;
}

/** Strip trailing/leading punctuation from a connect word (commas, danda, etc.). */
function stripConnectWordPunctuation(word) {
  return String(word || '')
    .replace(/^[,;:.!?\-–—]+/u, '')
    .replace(/[,;:.!?\-–—]+$/u, '')
    .replace(/[।॥]+/g, '')
    .trim();
}

function normalizeConnectWords(text) {
  const flat = String(text || '')
    .replace(/\n+/g, ' ')
    .replace(/\s*[।॥]+\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return flat
    .split(/\s+/)
    .map(stripConnectWordPunctuation)
    .filter(Boolean);
}

/** First N words of sthayi for inline refrain; longer sthayi gets trailing ... */
function sthayiConnectSuffixFromSthayi(sthayi) {
  const words = normalizeConnectWords(sthayi);
  if (words.length <= STHAYI_CONNECT_MAX_WORDS) return words.join(' ');
  return `${words.slice(0, STHAYI_CONNECT_MAX_WORDS).join(' ')}...`;
}

/** Explicit YAML `sthayi_connect_text`, else truncated sthayi. */
function resolveSthayiConnectSuffix(part) {
  const explicit = String(part?.sthayi_connect_text || '').trim();
  if (explicit) {
    return normalizeConnectWords(explicit).join(' ');
  }
  if (!isSthayiConnectEnabled(part) || !part.sthayi) return null;
  return sthayiConnectSuffixFromSthayi(part.sthayi);
}

function appendSthayiConnectToParagraph(text, suffix) {
  if (!suffix) return String(text || '').trim();
  const tail = `${STHAYI_CONNECT_TAIL}${suffix}`;
  const body = String(text || '').trim();
  if (isMultilineParagraph(body)) {
    const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return body;
    const last = lines.length - 1;
    lines[last] = lineWithoutEndDanda(lines[last]) + tail;
    return lines.join('\n');
  }
  return lineWithoutEndDanda(body) + tail;
}

function renderParagraphHtml(text, verseNum, opts = {}) {
  const body = opts.sthayiSuffix
    ? appendSthayiConnectToParagraph(text, opts.sthayiSuffix)
    : String(text || '').trim();
  if (!body) return { html: '', nextVerse: verseNum };

  const stripe = lyricsAntaraStripeClass(verseNum);

  if (isMultilineParagraph(body)) {
    const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
    const { html, nextVerse } = renderBlockLines(lines, { verseNum });
    return {
      html: `<p class="lyrics-antara lyrics-antara--block ${stripe}">${html}</p>`,
      nextVerse,
    };
  }

  const core = lineWithoutEndDanda(body);
  const marker = formatDandaVerse(verseNum);
  return {
    html: `<p class="lyrics-antara ${stripe}">${escapeHtml(core)}<span class="lyrics-marker">${escapeHtml(marker)}</span></p>`,
    nextVerse: verseNum + 1,
  };
}

function renderSthayiHtml(sthayi, sthayiMarker) {
  const body = String(sthayi || '').trim();
  if (!body) return '';

  const endMarker = sthayiMarker === 'टेर' ? ' || टेर ||' : STHAYI_MARKER;

  if (isMultilineParagraph(body)) {
    const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
    const { html } = renderBlockLines(lines, { endMarker });
    return `<p class="lyrics-antara lyrics-antara--block lyrics-sthayi lyrics-antara--even">${html}</p>`;
  }

  const core = lineWithoutEndDanda(body);
  return `<p class="lyrics-antara lyrics-sthayi lyrics-antara--even">${escapeHtml(core)}<span class="lyrics-marker">${escapeHtml(endMarker)}</span></p>`;
}

function renderJabaniHtml(jabani) {
  const body = String(jabani || '').trim();
  if (!body) return '';

  if (isMultilineParagraph(body)) {
    const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
    const html = lines.map((l) => `<span class="lyrics-line">${escapeHtml(l)}</span>`).join('\n');
    return `<p class="lyrics-jabani">${html}</p>`;
  }
  return `<p class="lyrics-jabani">${escapeHtml(body)}</p>`;
}

function isCommentaryItem(item) {
  return item && typeof item === 'object' && item.commentary != null;
}

function paragraphText(item) {
  if (typeof item === 'string') return item;
  if (isCommentaryItem(item)) return item.commentary;
  return '';
}

function renderLyricsAsideHtml(text, kind) {
  const className =
    kind === 'pre-shlok' ? 'lyrics-pre-shlok' : kind === 'commentary' ? 'lyrics-commentary' : 'lyrics-dhvani';
  const inner = renderShlokBlockHtml(text, className);
  if (!inner) return '';
  const labels = {
    'pre-shlok': 'प्रारंभिक श्लोक',
    commentary: 'टीका',
    dhvani: 'ध्वनि',
  };
  return `<div class="lyrics-aside lyrics-aside--${kind}" aria-label="${labels[kind] || kind}">${inner}</div>`;
}

function renderLyricsPart(part, tarzHtml) {
  const chunks = [];
  if (tarzHtml) chunks.push(tarzHtml);

  if (part.pre_shlok) {
    chunks.push(renderLyricsAsideHtml(part.pre_shlok, 'pre-shlok'));
  }

  const sthayiSuffix = resolveSthayiConnectSuffix(part);

  if (part.sthayi) {
    const sthayiHtml = renderSthayiHtml(part.sthayi, part.sthayi_marker);
    if (sthayiHtml) chunks.push(sthayiHtml);
  }

  let paraNum = 1;
  for (const item of part.paragraphs || []) {
    if (isCommentaryItem(item)) {
      const commentaryHtml = renderLyricsAsideHtml(item.commentary, 'commentary');
      if (commentaryHtml) chunks.push(commentaryHtml);
      continue;
    }
    const para = paragraphText(item);
    if (!String(para).trim()) continue;
    if (isJabaniText(para)) continue;
    const { html, nextVerse } = renderParagraphHtml(para, paraNum, { sthayiSuffix });
    if (html) chunks.push(html);
    paraNum = nextVerse;
  }

  if (part.dhvani) {
    chunks.push(renderLyricsAsideHtml(part.dhvani, 'dhvani'));
  }

  return chunks.filter(Boolean).join('\n');
}

function lyricsStructureToHtml(lyrics, tarz) {
  const tarzHtml = tarz
    ? `<p class="lyrics-tarz">तर्ज — ${escapeHtml(String(tarz).trim())}</p>`
    : '';

  if (!lyrics) return tarzHtml ? `<div class="bhajan-lyrics bhajan-lyrics--standard">${tarzHtml}</div>` : '';

  let parts;
  if (typeof lyrics === 'string') {
    const norm = normalizeFromLegacy(lyrics);
    if (norm.parts) parts = norm.parts;
    else parts = [{
      pre_shlok: norm.pre_shlok,
      sthayi: norm.sthayi,
      sthayi_marker: norm.sthayi_marker,
      paragraphs: norm.paragraphs,
      dhvani: norm.dhvani,
    }];
  } else if (lyrics.parts?.length) {
    parts = lyrics.parts;
  } else if (isStructuredLyrics(lyrics)) {
    parts = [
      {
        pre_shlok: lyrics.pre_shlok,
        sthayi: lyrics.sthayi,
        sthayi_marker: lyrics.sthayi_marker,
        sthayi_connect: lyrics.sthayi_connect,
        sthayi_connect_text: lyrics.sthayi_connect_text,
        paragraphs: lyrics.paragraphs,
        dhvani: lyrics.dhvani,
      },
    ];
  } else {
    return tarzHtml;
  }

  const html = parts.map((p, i) => renderLyricsPart(p, i === 0 ? tarzHtml : '')).join('\n');
  if (!html && !tarzHtml) return '';
  return `<div class="bhajan-lyrics bhajan-lyrics--standard">${html}</div>`;
}

function renderShlokBlockHtml(text, className) {
  const body = String(text || '').trim();
  if (!body) return '';

  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  const html = lines.map((l) => `<span class="lyrics-line">${escapeHtml(l)}</span>`).join('\n');
  return `<p class="${className}">${html}</p>`;
}

function renderDhvaniHtml(dhvani) {
  return renderShlokBlockHtml(dhvani, 'lyrics-dhvani');
}

function renderPreShlokHtml(preShlok) {
  return renderShlokBlockHtml(preShlok, 'lyrics-pre-shlok');
}

function preShlokToHtml(preShlok) {
  const body = renderPreShlokHtml(preShlok);
  if (!body) return '';
  return `<div class="bhajan-card__pre-shlok" aria-label="प्रारंभिक श्लोक">${body}</div>`;
}

function dhvaniToHtml(dhvani) {
  const body = renderDhvaniHtml(dhvani);
  if (!body) return '';
  return `<div class="bhajan-card__dhvani" aria-label="ध्वनि">${body}</div>`;
}

function jabaniToHtml(jabani) {
  const body = renderJabaniHtml(jabani);
  if (!body) return '';
  return `<div class="bhajan-card__jabani">${body}</div>`;
}

function lyricsToHtml(lyrics, tarz) {
  if (isStructuredLyrics(lyrics) || typeof lyrics === 'string') {
    return lyricsStructureToHtml(lyrics, tarz);
  }
  return '';
}

module.exports = { escapeHtml, lyricsToHtml, jabaniToHtml, dhvaniToHtml, preShlokToHtml, lyricsStructureToHtml };
