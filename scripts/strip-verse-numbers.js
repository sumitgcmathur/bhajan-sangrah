#!/usr/bin/env node
/** Strip stored verse numbers from structured content YAML (in-place). */
const fs = require('fs');
const path = require('path');
const { CONTENT } = require('./lib/paths');
const { loadBhajanDoc, dumpBhajanDoc } = require('./lib/yaml-io');
const { isStructuredLyrics, sanitizeStanzaText } = require('./lib/lyrics-structure');

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) {
      if (name.startsWith('content-backup')) continue;
      walk(p, out);
    } else if (name.endsWith('.yaml') && name !== 'sections.yaml') {
      out.push(p);
    }
  }
  return out;
}

function stripDoc(doc) {
  if (!isStructuredLyrics(doc.lyrics)) return doc;
  const lyrics = { ...doc.lyrics };
  if (lyrics.sthayi) lyrics.sthayi = sanitizeStanzaText(lyrics.sthayi);
  if (lyrics.paragraphs) {
    lyrics.paragraphs = lyrics.paragraphs.map((p) => sanitizeStanzaText(p));
  }
  return { ...doc, lyrics };
}

let n = 0;
for (const fp of walk(CONTENT)) {
  const doc = loadBhajanDoc(fs.readFileSync(fp, 'utf8'));
  if (!doc.title) continue;
  const stripped = stripDoc(doc);
  fs.writeFileSync(fp, dumpBhajanDoc(stripped), 'utf8');
  n += 1;
}
console.log(`Stripped verse numbers in ${n} files.`);
