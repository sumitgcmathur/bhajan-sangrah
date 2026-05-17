function stripTags(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\u00a0/g, ' ');
}

function collectHeadings(html, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const matches = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    matches.push({
      index: m.index,
      title: stripTags(m[1]).replace(/\s+/g, ' ').trim(),
      end: m.index + m[0].length,
    });
  }
  return matches;
}

function parseChunk(chunk, title, swarachitDefault) {
  const raw = stripTags(chunk);
  let tarz = '';
  const body = raw.replace(/^\s*तर्ज\s*:\s*(.+)$/m, (_, t) => {
    tarz = t.replace(/\s+/g, ' ').trim();
    return '';
  });
  const lines = body
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l && l !== title);
  if (!lines.length) return null;
  const doc = { title, lyrics: lines.join('\n') };
  if (tarz) doc.tarz = tarz;
  if (swarachitDefault) doc.swarachit = true;
  return doc;
}

function parseBhajans(html, sectionTitle, options = {}) {
  const swDefault = options.swarachitSection === true;
  let matches = collectHeadings(html, 'h1');
  let skipFirst = true;
  if (!matches.length) {
    matches = collectHeadings(html, 'h3');
    skipFirst = false;
  }
  const bhajans = [];
  for (let i = 0; i < matches.length; i++) {
    const { title, end } = matches[i];
    if (!title) continue;
    if (skipFirst && i === 0 && title === sectionTitle) continue;
    const chunkEnd = matches[i + 1] ? matches[i + 1].index : html.length;
    const doc = parseChunk(html.slice(end, chunkEnd), title, swDefault);
    if (doc) bhajans.push(doc);
  }
  return bhajans;
}

function extractBannerUrl(html) {
  const m = html.match(/property="og:image"\s+content="([^"]+)"/);
  return m ? m[1] : null;
}

module.exports = { parseBhajans, extractBannerUrl };