const {
  isStructuredLyrics,
  isMultilineParagraph,
  toDevaNum,
  normalizeFromLegacy,
} = require('./lyrics-structure');

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

function renderBlockLines(lines, verseNum) {
  if (!lines.length) return { html: '', nextVerse: verseNum };

  const out = [];
  let n = verseNum;
  const couplet = lines.length >= 2;

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    if (isRefrainLine(t)) {
      out.push(`<span class="lyrics-refrain">${escapeHtml(t)}</span>`);
      continue;
    }
    const numbered = (couplet && i === lines.length - 1) || (!couplet && i === 0);
    if (numbered) {
      const core = lineWithoutEndDanda(t);
      out.push(
        `${escapeHtml(core)}<span class="lyrics-marker">${escapeHtml(formatDandaVerse(n))}</span>`
      );
      n += 1;
    } else {
      out.push(escapeHtml(t));
    }
  }

  return { html: out.join('<br>\n'), nextVerse: n };
}

function renderParagraphHtml(text, verseNum) {
  const body = String(text || '').trim();
  if (!body) return { html: '', nextVerse: verseNum };

  if (isMultilineParagraph(body)) {
    const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
    const { html, nextVerse } = renderBlockLines(lines, verseNum);
    return {
      html: `<p class="lyrics-antara lyrics-antara--block">${html}</p>`,
      nextVerse,
    };
  }

  const marker = verseNum > 0 ? formatMarker(verseNum) : '';
  return {
    html: `<p class="lyrics-antara">${escapeHtml(body)}${marker ? ` <span class="lyrics-marker">${escapeHtml(marker)}</span>` : ''}</p>`,
    nextVerse: verseNum > 0 ? verseNum + 1 : verseNum,
  };
}

function renderSthayiHtml(sthayi, sthayiMarker, verseNum) {
  const body = String(sthayi || '').trim();
  if (!body) return { html: '', nextVerse: verseNum };

  if (isMultilineParagraph(body)) {
    const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
    const { html, nextVerse } = renderBlockLines(lines, verseNum);
    return { html: `<p class="lyrics-sthayi">${html}</p>`, nextVerse };
  }

  let marker = '';
  if (sthayiMarker === 'टेर') {
    marker = ` <span class="lyrics-marker">|| टेर ||</span>`;
  }
  return {
    html: `<p class="lyrics-sthayi">${escapeHtml(body)}${marker}</p>`,
    nextVerse: verseNum,
  };
}

function renderLyricsPart(part, tarzHtml) {
  const chunks = [];
  if (tarzHtml) chunks.push(tarzHtml);

  let verseNum = 1;

  if (part.sthayi) {
    const { html, nextVerse } = renderSthayiHtml(part.sthayi, part.sthayi_marker, verseNum);
    if (html) chunks.push(html);
    verseNum = nextVerse;
  }

  for (const para of part.paragraphs || []) {
    if (!String(para).trim()) continue;
    const { html, nextVerse } = renderParagraphHtml(para, verseNum);
    if (html) chunks.push(html);
    verseNum = nextVerse;
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
  return `<div class="bhajan-lyrics bhajan-lyrics--standard">${html}</div>`;
}

function lyricsToHtml(lyrics, tarz) {
  if (isStructuredLyrics(lyrics) || typeof lyrics === 'string') {
    return lyricsStructureToHtml(lyrics, tarz);
  }
  return '';
}

module.exports = { escapeHtml, lyricsToHtml, lyricsStructureToHtml };
