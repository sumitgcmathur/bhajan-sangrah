const fs = require('fs');
const { isStructuredLyrics } = require('./lyrics-structure');

function parseScalar(line) {
  const m = line.match(/^([^:]+):\s*(.*)$/);
  if (!m) return null;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
    v = v.slice(1, -1);
  if (v === 'true') return { key: m[1].trim(), value: true };
  if (v === 'false') return { key: m[1].trim(), value: false };
  return { key: m[1].trim(), value: v };
}

function readIndentedBlock(lines, startIdx, baseIndent) {
  const block = [];
  let i = startIdx;
  while (i < lines.length) {
    const raw = lines[i];
    if (!raw.trim()) {
      block.push('');
      i += 1;
      continue;
    }
    const indent = raw.match(/^(\s*)/)[1].length;
    if (indent < baseIndent && /^\s*\S/.test(raw)) break;
    if (/^[a-zA-Z_][\w-]*:\s/.test(raw) && indent <= baseIndent) break;
    block.push(raw.slice(baseIndent));
    i += 1;
  }
  return { text: block.join('\n').replace(/\n+$/, ''), next: i };
}

function parseParagraphList(lines, startIdx, baseIndent) {
  const paragraphs = [];
  let i = startIdx;
  while (i < lines.length) {
    const raw = lines[i];
    if (!raw.trim()) {
      i += 1;
      continue;
    }
    const indent = raw.match(/^(\s*)/)[1].length;
    if (indent < baseIndent) break;

    const listMatch = raw.match(/^(\s*)-\s+\|\s*$/);
    if (listMatch) {
      const itemIndent = listMatch[1].length + 2;
      const { text, next } = readIndentedBlock(lines, i + 1, itemIndent);
      paragraphs.push(text);
      i = next;
      continue;
    }

    const commentaryMatch = raw.match(/^(\s*)-\s+commentary:\s*\|\s*$/);
    if (commentaryMatch) {
      const itemIndent = commentaryMatch[1].length + 2;
      const { text, next } = readIndentedBlock(lines, i + 1, itemIndent);
      paragraphs.push({ commentary: text });
      i = next;
      continue;
    }

    if (/^[a-zA-Z_][\w-]*:\s/.test(raw) && indent === baseIndent) break;
    break;
  }
  return { paragraphs, next: i };
}

function parseLyricsObject(lines, startIdx) {
  const lyrics = {};
  let i = startIdx;
  const baseIndent = 2;

  while (i < lines.length) {
    const raw = lines[i];
    if (!raw.trim()) {
      i += 1;
      continue;
    }
    const indent = raw.match(/^(\s*)/)[1].length;
    if (indent < baseIndent) break;

    if (raw.match(/^\s{2}parts:\s*$/)) {
      lyrics.parts = [];
      i += 1;
      let part = null;
      while (i < lines.length) {
        const pr = lines[i];
        if (!pr.trim()) {
          i += 1;
          continue;
        }
        const pi = pr.match(/^(\s*)/)[1].length;
        if (pi < 4) break;
        if (pr.match(/^\s{4}-\s+sthayi:\s*\|\s*$/)) {
          if (part) lyrics.parts.push(part);
          part = { paragraphs: [] };
          const { text, next } = readIndentedBlock(lines, i + 1, 8);
          part.sthayi = text;
          i = next;
          continue;
        }
        if (part && pr.match(/^\s{6}paragraphs:\s*$/)) {
          const parsed = parseParagraphList(lines, i + 1, 8);
          part.paragraphs = parsed.paragraphs;
          i = parsed.next;
          continue;
        }
        break;
      }
      if (part) lyrics.parts.push(part);
      continue;
    }

    if (raw.match(/^\s{2}sthayi:\s*\|\s*$/)) {
      const { text, next } = readIndentedBlock(lines, i + 1, baseIndent + 2);
      lyrics.sthayi = text;
      i = next;
      continue;
    }

    if (raw.match(/^\s{2}paragraphs:\s*$/)) {
      const parsed = parseParagraphList(lines, i + 1, baseIndent);
      lyrics.paragraphs = parsed.paragraphs;
      i = parsed.next;
      continue;
    }

    if (raw.match(/^\s{2}sthayi_connect:\s/)) {
      const v = raw.replace(/^\s{2}sthayi_connect:\s*/, '').trim();
      if (v === 'true') lyrics.sthayi_connect = true;
      else if (v === 'false') lyrics.sthayi_connect = false;
      i += 1;
      continue;
    }

    if (raw.match(/^\s{2}sthayi_connect_text:\s*\|\s*$/)) {
      const { text, next } = readIndentedBlock(lines, i + 1, baseIndent + 2);
      lyrics.sthayi_connect_text = text.replace(/\n+/g, ' ').trim();
      i = next;
      continue;
    }

    if (raw.match(/^\s{2}sthayi_connect_text:\s/)) {
      lyrics.sthayi_connect_text = raw.replace(/^\s{2}sthayi_connect_text:\s*/, '').trim();
      i += 1;
      continue;
    }

    if (raw.match(/^\s{2}pre_(?:shlok|sthayi):\s*\|\s*$/)) {
      const { text, next } = readIndentedBlock(lines, i + 1, baseIndent + 2);
      lyrics.pre_shlok = text;
      i = next;
      continue;
    }

    if (raw.match(/^\s{2}post_shlok:\s*\|\s*$/)) {
      const { text, next } = readIndentedBlock(lines, i + 1, baseIndent + 2);
      lyrics.post_shlok = text;
      i = next;
      continue;
    }

    if (raw.match(/^\s{2}(?:dhvani|shlok|jabani):\s*\|\s*$/)) {
      const { text, next } = readIndentedBlock(lines, i + 1, baseIndent + 2);
      if (!lyrics._legacyPostPieces) lyrics._legacyPostPieces = [];
      lyrics._legacyPostPieces.push(text);
      i = next;
      continue;
    }

    break;
  }

  return { lyrics, next: i };
}

function pushPostPiece(pieces, text) {
  const s = String(text || '').trim();
  if (s) pieces.push(s);
}

/** Merge post_shlok and legacy dhvani / shlok / jabani into lyrics.post_shlok. */
function normalizeLyricsDoc(doc) {
  const out = { ...doc };
  const postPieces = [];

  pushPostPiece(postPieces, out.post_shlok);
  pushPostPiece(postPieces, out.dhvani);
  pushPostPiece(postPieces, out.shlok);
  pushPostPiece(postPieces, out.jabani);
  for (const piece of out._legacyPostPieces || []) pushPostPiece(postPieces, piece);
  delete out.post_shlok;
  delete out.dhvani;
  delete out.shlok;
  delete out.jabani;
  delete out._legacyPostPieces;

  if (typeof out.lyrics === 'string' || !out.lyrics) {
    if (postPieces.length) {
      out.lyrics = { post_shlok: postPieces.join('\n\n') };
    }
    if (out.pre_shlok) {
      out.lyrics = typeof out.lyrics === 'object' ? out.lyrics : {};
      if (!out.lyrics.pre_shlok) out.lyrics.pre_shlok = out.pre_shlok;
    }
    delete out.pre_shlok;
    return out;
  }

  const lyrics = { ...out.lyrics };
  if (out.pre_shlok && !lyrics.pre_shlok) lyrics.pre_shlok = out.pre_shlok;
  if (lyrics._legacyPreShlok) {
    if (!lyrics.pre_shlok) lyrics.pre_shlok = lyrics._legacyPreShlok;
    delete lyrics._legacyPreShlok;
  }
  delete out.pre_shlok;

  pushPostPiece(postPieces, lyrics.post_shlok);
  pushPostPiece(postPieces, lyrics.dhvani);
  pushPostPiece(postPieces, lyrics.shlok);
  pushPostPiece(postPieces, lyrics.jabani);
  for (const piece of lyrics._legacyPostPieces || []) pushPostPiece(postPieces, piece);
  delete lyrics.dhvani;
  delete lyrics.shlok;
  delete lyrics.jabani;
  delete lyrics._legacyPostPieces;

  if (postPieces.length) lyrics.post_shlok = postPieces.join('\n\n');
  else delete lyrics.post_shlok;

  out.lyrics = lyrics;
  return out;
}

/** Parse a single bhajan YAML file */
function loadBhajanDoc(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n');
  const doc = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) {
      i += 1;
      continue;
    }
    if (line.match(/^pre_shlok:\s*\|\s*$/)) {
      const { text, next } = readIndentedBlock(lines, i + 1, 2);
      doc.pre_shlok = text;
      i = next;
      continue;
    }
    if (line.match(/^post_shlok:\s*\|\s*$/)) {
      const { text, next } = readIndentedBlock(lines, i + 1, 2);
      doc.post_shlok = text;
      i = next;
      continue;
    }
    if (line.match(/^(?:dhvani|shlok|jabani):\s*\|\s*$/)) {
      const { text, next } = readIndentedBlock(lines, i + 1, 2);
      if (!doc._legacyPostPieces) doc._legacyPostPieces = [];
      doc._legacyPostPieces.push(text);
      i = next;
      continue;
    }
    if (line.match(/^lyrics:\s*\|/)) {
      i += 1;
      const block = [];
      while (i < lines.length) {
        const raw = lines[i];
        if (/^[a-zA-Z_][\w-]*:\s/.test(raw)) break;
        block.push(raw.replace(/^\s{0,2}/, ''));
        i += 1;
      }
      doc.lyrics = block.join('\n').replace(/\n+$/, '');
      continue;
    }
    if (line.match(/^lyrics:\s*$/)) {
      const parsed = parseLyricsObject(lines, i + 1);
      doc.lyrics = parsed.lyrics;
      i = parsed.next;
      continue;
    }
    const p = parseScalar(line);
    if (p) doc[p.key] = p.value;
    i += 1;
  }
  return normalizeLyricsDoc(doc);
}

function dumpLiteralBlock(key, text, indent) {
  const pad = ' '.repeat(indent);
  const contentPad = ' '.repeat(indent + 2);
  const out = [`${pad}${key}: |`];
  for (const line of String(text || '').split('\n')) {
    out.push(`${contentPad}${line.replace(/^\s+/, '')}`);
  }
  return out;
}

function dumpParagraphList(paragraphs, indent) {
  const pad = ' '.repeat(indent);
  const itemPad = ' '.repeat(indent + 2);
  const out = [`${pad}paragraphs:`];
  for (const para of paragraphs || []) {
    if (para && typeof para === 'object' && para.commentary != null) {
      out.push(`${itemPad}- commentary: |`);
      for (const line of String(para.commentary).split('\n')) {
        out.push(`${itemPad}  ${line.replace(/^\s+/, '')}`);
      }
      continue;
    }
    out.push(`${itemPad}- |`);
    for (const line of String(para).split('\n')) {
      out.push(`${itemPad}  ${line.replace(/^\s+/, '')}`);
    }
  }
  return out;
}

function dumpLyricsObject(lyrics) {
  const out = ['lyrics:'];
  if (lyrics.parts?.length) {
    out.push('  parts:');
    for (const part of lyrics.parts) {
      out.push('    - sthayi: |');
      for (const line of String(part.sthayi || '').split('\n')) out.push(`        ${line}`);
      out.push(...dumpParagraphList(part.paragraphs, 6));
    }
    return out;
  }
  if (lyrics.pre_shlok) out.push(...dumpLiteralBlock('pre_shlok', lyrics.pre_shlok, 2));
  if (lyrics.sthayi) out.push(...dumpLiteralBlock('sthayi', lyrics.sthayi, 2));
  if (lyrics.sthayi_connect === false) out.push('  sthayi_connect: false');
  else if (lyrics.sthayi_connect === true) out.push('  sthayi_connect: true');
  if (lyrics.sthayi_connect_text) {
    out.push(`  sthayi_connect_text: ${lyrics.sthayi_connect_text}`);
  }
  if (lyrics.paragraphs?.length) out.push(...dumpParagraphList(lyrics.paragraphs, 2));
  if (lyrics.post_shlok) out.push(...dumpLiteralBlock('post_shlok', lyrics.post_shlok, 2));
  return out;
}

function dumpBhajanDoc(doc) {
  const out = [];
  out.push(`title: ${doc.title}`);
  out.push(`romantitle: ${doc.romantitle || doc.title}`);
  if (doc.tarz) out.push(`tarz: ${doc.tarz}`);
  if (doc.group) out.push(`group: ${doc.group}`);
  if (doc.swarachit) out.push('swarachit: true');
  if (isStructuredLyrics(doc.lyrics)) {
    out.push(...dumpLyricsObject(doc.lyrics));
  } else {
    out.push('lyrics: |');
    for (const line of String(doc.lyrics || '').split('\n')) out.push(`  ${line}`);
  }
  return out.join('\n') + '\n';
}

/** Parse content/sections.yaml */
function loadSectionsDoc(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n');
  const config = { sections: [] };
  let i = 0;
  let current = null;

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();
    if (!line.trim() || line.trim().startsWith('#')) {
      i += 1;
      continue;
    }
    if (line.match(/^sections:\s*$/)) {
      i += 1;
      continue;
    }
    if (line.match(/^\s*-\s+slug:/)) {
      if (current) config.sections.push(current);
      current = { slug: line.replace(/^\s*-\s+slug:\s*/, '').trim() };
      i += 1;
      continue;
    }
    const indent = raw.match(/^(\s*)/)[1].length;
    const p = parseScalar(line.trim());
    if (p && indent >= 2 && current) {
      current[p.key] = p.value;
    } else if (p && indent < 2) {
      config[p.key] = p.value;
    }
    i += 1;
  }
  if (current) config.sections.push(current);
  return config;
}

function dumpSectionsDoc(config) {
  const out = [];
  out.push(`base_url: ${config.base_url || '/'}`);
  out.push(`site_title: ${config.site_title || 'भजन संग्रह'}`);
  if (config.site_icon) out.push(`site_icon: ${config.site_icon}`);
  if (config.home_banner) out.push(`home_banner: ${config.home_banner}`);
  if (config.sthayi_connect === true) out.push('sthayi_connect: true');
  else if (config.sthayi_connect === false) out.push('sthayi_connect: false');
  out.push('');
  out.push('sections:');
  for (const s of config.sections) {
    out.push(`  - slug: ${s.slug}`);
    out.push(`    folder: ${s.folder}`);
    out.push(`    google_path: ${s.google_path}`);
    out.push(`    title: ${s.title}`);
    if (s.banner) out.push(`    banner: ${s.banner}`);
    if (s.grouped) out.push('    grouped: true');
    if (s.bhajan_order === 'file' || s.bhajan_order === 'title') {
      out.push(`    bhajan_order: ${s.bhajan_order}`);
    }
    if (s.sthayi_connect === true) out.push('    sthayi_connect: true');
    else if (s.sthayi_connect === false) out.push('    sthayi_connect: false');
  }
  return out.join('\n') + '\n';
}

function loadFile(path, kind) {
  const text = fs.readFileSync(path, 'utf8');
  return kind === 'sections' ? loadSectionsDoc(text) : loadBhajanDoc(text);
}

function dumpFile(path, data, kind) {
  const body = kind === 'sections' ? dumpSectionsDoc(data) : dumpBhajanDoc(data);
  fs.writeFileSync(path, body, 'utf8');
}

module.exports = {
  loadBhajanDoc,
  dumpBhajanDoc,
  loadSectionsDoc,
  dumpSectionsDoc,
  loadFile,
  dumpFile,
};
