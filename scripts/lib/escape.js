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

function renderParagraphHtml(text, index) {
  const body = String(text || '').trim();
  if (!body) return '';
  if (isMultilineParagraph(body)) {
    const inner = body
      .split('\n')
      .map((l) => escapeHtml(l.trim()))
      .filter(Boolean)
      .join('<br>\n');
    const suffix = /॥\s*$/.test(body) ? '' : ' ॥';
    return `<p class="lyrics-antara lyrics-antara--block">${inner}${suffix ? escapeHtml(suffix) : ''}</p>`;
  }
  const marker = index > 0 ? formatMarker(index) : '';
  return `<p class="lyrics-antara">${escapeHtml(body)}${marker ? ` <span class="lyrics-marker">${escapeHtml(marker)}</span>` : ''}</p>`;
}

function renderSthayiHtml(sthayi, sthayiMarker) {
  const body = String(sthayi || '').trim();
  if (!body) return '';
  const inner = isMultilineParagraph(body)
    ? body
        .split('\n')
        .map((l) => escapeHtml(l.trim()))
        .filter(Boolean)
        .join('<br>\n')
    : escapeHtml(body);
  let marker = '';
  if (sthayiMarker === 'टेर') {
    marker = ` <span class="lyrics-marker">|| टेर ||</span>`;
  } else if (!isMultilineParagraph(body) && !/॥\s*$/.test(body)) {
    marker = ` <span class="lyrics-marker">॥</span>`;
  }
  return `<p class="lyrics-sthayi">${inner}${marker}</p>`;
}

function renderLyricsPart(part, tarzHtml) {
  const chunks = [];
  if (tarzHtml) chunks.push(tarzHtml);
  if (part.sthayi) chunks.push(renderSthayiHtml(part.sthayi, part.sthayi_marker));
  let n = 0;
  for (const para of part.paragraphs || []) {
    if (!String(para).trim()) continue;
    if (isMultilineParagraph(para)) {
      chunks.push(renderParagraphHtml(para, 0));
    } else {
      n += 1;
      chunks.push(renderParagraphHtml(para, n));
    }
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
