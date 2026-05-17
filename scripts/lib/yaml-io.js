const fs = require('fs');

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
        if (lines[i].match(/^\S/) && !lines[i].startsWith(' ')) break;
        block.push(lines[i].replace(/^\s{0,2}/, ''));
        i += 1;
      }
      doc.lyrics = block.join('\n').replace(/\n+$/, '');
      continue;
    }
    const p = parseScalar(line);
    if (p) doc[p.key] = p.value;
    i += 1;
  }
  return doc;
}

function dumpBhajanDoc(doc) {
  const out = [];
  out.push(`title: ${doc.title}`);
  if (doc.tarz) out.push(`tarz: ${doc.tarz}`);
  if (doc.swarachit) out.push('swarachit: true');
  out.push('lyrics: |');
  for (const line of String(doc.lyrics || '').split('\n')) out.push(`  ${line}`);
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
  out.push('');
  out.push('sections:');
  for (const s of config.sections) {
    out.push(`  - slug: ${s.slug}`);
    out.push(`    folder: ${s.folder}`);
    out.push(`    google_path: ${s.google_path}`);
    out.push(`    title: ${s.title}`);
    if (s.banner) out.push(`    banner: ${s.banner}`);
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