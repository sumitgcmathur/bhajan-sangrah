/** Ensure Devanagari lyric lines end with । or ॥ */

function endsWithDanda(text) {
  const t = text.trimEnd();
  if (!t) return true;
  // ॥, ॥१॥, ...॥, etc.
  if (/॥/.test(t) && /॥\s*$/.test(t)) return true;
  if (/\.\.\.\s*॥\s*$/.test(t)) return true;
  if (/…\s*॥\s*$/.test(t)) return true;
  // single danda at end (not part of ॥)
  if (/।\s*$/.test(t)) return true;
  return false;
}

function normalizeLyricLine(line) {
  const trimmed = line.trimEnd();
  const lead = line.slice(0, line.length - trimmed.length);
  let t = trimmed;

  if (!t.trim()) return line;

  if (endsWithDanda(t)) {
    // Fix ।. or trailing whitespace after danda
    t = t.replace(/।\.\s*$/, '।').replace(/\s+$/, '');
    return lead + t;
  }

  // Trailing comma (common in scraped lyrics) -> ।
  if (/,\s*$/.test(t)) {
    t = t.replace(/,\s*$/, '।');
    return lead + t;
  }

  // Latin full stop -> ।
  if (/\.\s*$/.test(t)) {
    t = t.replace(/\.\s*$/, '।');
    return lead + t;
  }

  return lead + t + '।';
}

function normalizeLyricsText(text) {
  return String(text || '')
    .split('\n')
    .map((line) => normalizeLyricLine(line))
    .join('\n');
}

module.exports = { normalizeLyricLine, normalizeLyricsText, endsWithDanda };
