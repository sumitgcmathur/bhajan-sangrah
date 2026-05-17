/** Remove boilerplate lines scraped from Google Sites footers */
const JUNK_LINE = [
  /^Google Sites$/i,
  /^Report abuse$/i,
  /^Skip to main content$/i,
  /^Skip to navigation$/i,
  /^Embedded Files$/i,
  /^Search this site$/i,
  /^DOCS_timing\b/i,
  /^window\.WIZ_/i,
  /^Page built by Google/i,
];

function isJunkLine(line) {
  const t = String(line || '').trim();
  if (!t) return false;
  return JUNK_LINE.some((re) => re.test(t));
}

function cleanLyricsText(text) {
  return String(text || '')
    .split('\n')
    .filter((line) => !isJunkLine(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanBhajanDoc(doc) {
  const out = { ...doc };
  if (out.lyrics) out.lyrics = cleanLyricsText(out.lyrics);
  if (out.tarz && isJunkLine(out.tarz)) delete out.tarz;
  return out;
}

module.exports = { isJunkLine, cleanLyricsText, cleanBhajanDoc };