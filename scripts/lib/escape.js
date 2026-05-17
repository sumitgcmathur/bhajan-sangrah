function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function lyricsToHtml(lyrics) {
  const lines = String(lyrics || '').split('\n');
  return lines
    .map((line) => {
      const t = line.trimEnd();
      if (!t.trim()) return '<p class="stanza-gap" aria-hidden="true">&nbsp;</p>';
      return `<p>${escapeHtml(t)}</p>`;
    })
    .join('\n');
}

module.exports = { escapeHtml, lyricsToHtml };
