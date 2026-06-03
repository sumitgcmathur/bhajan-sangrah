#!/usr/bin/env node
/**
 * Apply chosen spelling standards from spelling-report.html (Fix selections).
 *   node scripts/apply-spelling-standard.js
 */
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./lib/paths');

/** Phrase / compound fixes (longest first) */
const PHRASE_REPLACEMENTS = [
  ['शुभ निशुभ', 'शुम्भ निशुम्भ'],
  ['शुंभ-निशुंभ', 'शुम्भ-निशुम्भ'],
  ['शुंभ निशुंभ', 'शुम्भ निशुम्भ'],
  ['शुंभादि', 'शुम्भादि'],
  ['कण्ठनपर', 'कण्ठन पर'],
  ['ब्रहमा पधारों', 'ब्रह्मा पधारो'],
  ['हां स्वान', 'हाँ स्वान'],
  ['उज्ज्चलसे', 'उज्ज्वल से'],
  ['पधाारो', 'पधारो'],
  ['कष्ण', 'कृष्ण'],
  // ज्योती before ॥ / ० is not a “word” for boundary regex
  ['ज्योती', 'ज्योति'],
];

/** Whole-word / isolated token fixes (longest first) */
const REPLACEMENTS = [
  // Earlier batch
  { from: 'अंबिकाजी', to: 'अम्बिकाजी' },
  { from: 'अंबिका', to: 'अम्बिका' },
  { from: 'संपत्ति', to: 'सम्पत्ति' },
  { from: 'सम्पति', to: 'सम्पत्ति' },
  { from: 'कंठन', to: 'कण्ठन' },
  { from: 'कंठ', to: 'कण्ठ' },
  { from: 'वृंदावन', to: 'वृन्दावन' },
  { from: 'विंदावन', to: 'वृन्दावन' },
  { from: 'सङ्कट', to: 'संकट' },
  { from: 'सङ्ग', to: 'संग' },
  // Shumbh / Nishumbh
  { from: 'निशुंभ', to: 'निशुम्भ' },
  { from: 'निषुम्भ', to: 'निशुम्भ' },
  { from: 'निशुभ', to: 'निशुम्भ' },
  { from: 'शुंभ', to: 'शुम्भ' },
  // Navaratri, variants
  { from: 'नवरात्री', to: 'नवरात्रि' },
  { from: 'सिदधि', to: 'सिद्धि' },
  { from: 'ज्योती', to: 'ज्योति' },
  { from: 'ब्रम्हाजी', to: 'ब्रह्माजी' },
  { from: 'ब्रम्हाणी', to: 'ब्रह्माणी' },
  { from: 'ब्रम्हा', to: 'ब्रह्मा' },
  { from: 'ब्रहमा', to: 'ब्रह्मा' },
  { from: 'कुंडल', to: 'कुण्डल' },
  { from: 'अंतर्यामी', to: 'अन्तर्यामी' },
  { from: 'स्वमी', to: 'स्वामी' },
  { from: 'केहरि्', to: 'केहरि' },
  // माँ / हाँ (word-boundary — skips मांग, मांस, etc.)
  { from: 'मांई', to: 'माँई' },
  { from: 'मांय', to: 'माँय' },
  { from: 'मांही', to: 'माँही' },
  { from: 'हांरे', to: 'हाँरे' },
  { from: 'मां', to: 'माँ' },
  { from: 'हां', to: 'हाँ' },
];

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceWholeWord(text, from, to) {
  if (!from || from === to) return text;
  // Allow trailing danda / verse markers (॥०) after bhajan tokens
  const re = new RegExp(
    `(?<![\\u0900-\\u097F])${escapeRegex(from)}(?![\\u0900-\\u097Fa-zA-Z])`,
    'gu',
  );
  return String(text).replace(re, to);
}

function listYamlFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listYamlFiles(p));
    else if (/\.ya?ml$/i.test(ent.name)) out.push(p);
  }
  return out;
}

function applyFile(filePath) {
  const original = fs.readFileSync(filePath, 'utf8');
  let text = original;

  for (const [from, to] of PHRASE_REPLACEMENTS) {
    if (text.includes(from)) text = text.split(from).join(to);
  }
  for (const { from, to } of REPLACEMENTS) {
    text = replaceWholeWord(text, from, to);
  }

  if (text !== original) {
    fs.writeFileSync(filePath, text, 'utf8');
    return true;
  }
  return false;
}

function main() {
  const contentDir = path.join(ROOT, 'content');
  const files = listYamlFiles(contentDir);
  let updated = 0;
  for (const fp of files) {
    if (applyFile(fp)) {
      updated += 1;
      console.log(path.relative(ROOT, fp));
    }
  }
  console.log(`\nUpdated ${updated} YAML file(s).`);
}

main();
