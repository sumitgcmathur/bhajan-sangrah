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
        if (part && pr.match(/^\s{6}sthayi_marker:\s/)) {
          part.sthayi_marker = pr.replace(/^\s{6}sthayi_marker:\s*/, '').trim();
          i += 1;
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

    if (raw.match(/^\s{2}sthayi_marker:\s/)) {
      lyrics.sthayi_marker = raw.replace(/^\s{2}sthayi_marker:\s*/, '').trim();
      i += 1;
      continue;
    }

    if (raw.match(/^\s{2}paragraphs:\s*$/)) {
      const parsed = parseParagraphList(lines, i + 1, baseIndent + 2);
      lyrics.paragraphs = parsed.paragraphs;
      i = parsed.next;
      continue;
    }

    break;
  }

  return { lyrics, next: i };
}

/** Parse a single bhajan YAML file */
function loadBhajanDoc(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const doc = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) {
      i += 1;
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
  return doc;
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
      if (part.sthayi_marker) out.push(`      sthayi_marker: ${part.sthayi_marker}`);
      out.push(...dumpParagraphList(part.paragraphs, 6));
    }
    return out;
  }
  out.push(...dumpLiteralBlock('sthayi', lyrics.sthayi, 2));
  if (lyrics.sthayi_marker) out.push(`  sthayi_marker: ${lyrics.sthayi_marker}`);
  out.push(...dumpParagraphList(lyrics.paragraphs, 2));
  return out;
}

function dumpBhajanDoc(doc) {
  const out = [];
  out.push(`title: ${doc.title}`);
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
  const lines = text.replace(/\r\n/g, '\n').split('\n');
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
  out.push('');
  out.push('sections:');
  for (const s of config.sections) {
    out.push(`  - slug: ${s.slug}`);
    out.push(`    folder: ${s.folder}`);
    out.push(`    google_path: ${s.google_path}`);
    out.push(`    title: ${s.title}`);
    if (s.banner) out.push(`    banner: ${s.banner}`);
    if (s.grouped) out.push('    grouped: true');
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
