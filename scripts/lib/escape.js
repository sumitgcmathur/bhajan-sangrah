const {
  isStructuredLyrics,
  isMultilineParagraph,
  toDevaNum,
  normalizeFromLegacy,
} = require('./lyrics-structure');

const STHAYI_MARKER = ' ॥स्थायी॥';
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
        `${escapeHtml(core)}<span class="lyrics-marker">${escapeHtml(marker)}</span>`
      );
      if (!fixedMarker) n += 1;
    } else {
      out.push(escapeHtml(t));
    }
  }

  return { html: out.join('<br>\n'), nextVerse: n };
}

function lyricsAntaraStripeClass(verseNum) {
  return verseNum % 2 === 1 ? 'lyrics-antara--odd' : 'lyrics-antara--even';
}

function renderParagraphHtml(text, verseNum) {
  const body = String(text || '').trim();
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
    const html = lines.map((l) => escapeHtml(l)).join('<br>\n');
    return `<p class="lyrics-jabani">${html}</p>`;
  }
  return `<p class="lyrics-jabani">${escapeHtml(body)}</p>`;
}

function renderLyricsPart(part, tarzHtml) {
  const chunks = [];
  if (tarzHtml) chunks.push(tarzHtml);

  if (part.sthayi) {
    const sthayiHtml = renderSthayiHtml(part.sthayi, part.sthayi_marker);
    if (sthayiHtml) chunks.push(sthayiHtml);
  }

  let paraNum = 1;
  for (const para of part.paragraphs || []) {
    if (!String(para).trim()) continue;
    if (isJabaniText(para)) continue;
    const { html, nextVerse } = renderParagraphHtml(para, paraNum);
    if (html) chunks.push(html);
    paraNum = nextVerse;
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
    else parts = [{ sthayi: norm.sthayi, sthayi_marker: norm.sthayi_marker, paragraphs: norm.paragraphs }];
  } else if (lyrics.parts?.length) {
    parts = lyrics.parts;
  } else if (isStructuredLyrics(lyrics)) {
    parts = [lyrics];
  } else {
    return tarzHtml;
  }

  const html = parts.map((p, i) => renderLyricsPart(p, i === 0 ? tarzHtml : '')).join('\n');
  if (!html && !tarzHtml) return '';
  return `<div class="bhajan-lyrics bhajan-lyrics--standard">${html}</div>`;
}

function renderShlokHtml(shlok) {
  const body = String(shlok || '').trim();
  if (!body) return '';

  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  const html = lines.map((l) => escapeHtml(l)).join('<br>\n');
  return `<p class="lyrics-shlok">${html}</p>`;
}

function shlokToHtml(shlok) {
  const body = renderShlokHtml(shlok);
  if (!body) return '';
  return `<div class="bhajan-card__shlok" aria-label="श्लोक">
  <p class="bhajan-card__shlok-label">श्लोक</p>
  ${body}
</div>`;
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

module.exports = { escapeHtml, lyricsToHtml, jabaniToHtml, shlokToHtml, lyricsStructureToHtml };
