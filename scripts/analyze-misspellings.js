#!/usr/bin/env node
/**
 * Read-only scan of all content YAML bhajans for likely misspellings.
 * Output: reports/misspelling-analysis.md
 */
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./lib/paths');
const { loadSections, sectionFolder, listBhajanFiles, loadBhajan } = require('./lib/sections');
const { flattenLyricsText } = require('./lib/lyrics-structure');

const OUT = path.join(ROOT, 'reports', 'misspelling-analysis.md');

/** @type {Array<{ id: string, test: (text: string) => RegExpMatchArray[] | null, note: string, suggest?: string, confidence: 'high'|'medium'|'low' }>} */
const PATTERNS = [
  {
    id: 'hriday-wrong',
    test: (t) => [...t.matchAll(/ह्रदय/g)],
    note: 'Standard form is हृदय (hriday); ह्रदय is a common misspelling.',
    suggest: 'हृदय',
    confidence: 'high',
  },
  {
    id: 'achyut-double-c',
    test: (t) => [...t.matchAll(/अच्चुत/g)],
    note: 'Famous stotra uses अच्युत (one च). Title/lyrics have double च.',
    suggest: 'अच्युत',
    confidence: 'high',
  },
  {
    id: 'aviveka-ending',
    test: (t) => [...t.matchAll(/अविवेका/g)],
    note: 'In “जानत अविवेक” the standard aarti line uses अविवेक (noun), not अविवेका.',
    suggest: 'अविवेक',
    confidence: 'medium',
  },
  {
    id: 'gudaraven',
    test: (t) => [...t.matchAll(/गुदरावें/g)],
    note: 'Likely गुजरावें (to petition / plead) in “कर जोर अरज गुजरावें”.',
    suggest: 'गुजरावें',
    confidence: 'medium',
  },
  {
    id: 'bhugate',
    test: (t) => [...t.matchAll(/भुगते/g)],
    note: 'May be भोगते (enjoy/suffer) — “जीवो भोगते” is the usual idiom; भुगते looks like a typo.',
    suggest: 'भोगते',
    confidence: 'medium',
  },
  {
    id: 'hogya',
    test: (t) => [...t.matchAll(/होग्या/g)],
    note: 'Colloquial past “हो गया” often written होग्या; verify intent.',
    suggest: 'हो गया',
    confidence: 'medium',
  },
  {
    id: 'padhya',
    test: (t) => [...t.matchAll(/पढया/g)],
    note: 'Likely पढ़ा / पढ़े (studied) — missing virama on ड़.',
    suggest: 'पढ़ा',
    confidence: 'high',
  },
  {
    id: 'hotare',
    test: (t) => [...t.matchAll(/होतरे/g)],
    note: 'Likely होते (plural) in “निराकार साकार होते”.',
    suggest: 'होते',
    confidence: 'high',
  },
  {
    id: 'hoykar',
    test: (t) => [...t.matchAll(/होयकार/g)],
    note: 'Likely “हो कर” (two words) — “प्रसन्न हो कर”.',
    suggest: 'हो कर',
    confidence: 'medium',
  },
  {
    id: 'hoijo',
    test: (t) => [...t.matchAll(/होइजो/g)],
    note: 'Rajasthani imperative; if standard Hindi intended, consider हो जाओ / मत हो.',
    confidence: 'low',
  },
  {
    id: 'jaijo',
    test: (t) => [...t.matchAll(/जाइजो/g)],
    note: 'Rajasthani; standard Hindi might be जाओ / चले जाओ.',
    confidence: 'low',
  },
  {
    id: 'astuti',
    test: (t) => [...t.matchAll(/अस्तुति/g)],
    note: 'Likely स्तुति (praise) — अस्तुति is rare/awkward.',
    suggest: 'स्तुति',
    confidence: 'medium',
  },
  {
    id: 'vidare',
    test: (t) => [...t.matchAll(/विडारे/g)],
    note: 'Likely विदारे / विदार (tear apart) — ड़ vs द़.',
    suggest: 'विदारे',
    confidence: 'medium',
  },
  {
    id: 'bijvaya',
    test: (t) => [...t.matchAll(/भिजवाया/g)],
    note: 'Likely भेजवाया (had sent) — भिज- vs भेज-.',
    suggest: 'भेजवाया',
    confidence: 'medium',
  },
  {
    id: 'densa',
    test: (t) => [...t.matchAll(/देंसा/g)],
    note: 'Same line elsewhere has देसां — inconsistent; verify regional देसा vs typo.',
    confidence: 'low',
  },
  {
    id: 'verse-suffix-glued',
    test: (t) => [...t.matchAll(/-[२३४५६७८९०१]+रे/g)],
    note: 'Verse repeat marker glued to “रे” (e.g. लगाय-२रे) — formatting artifact, not a word.',
    confidence: 'high',
  },
  {
    id: 'smart-quotes',
    test: (t) => [...t.matchAll(/[''""`´‘’“”]/g)],
    note: 'Smart/ASCII quotes around words — can break spellcheck tokenization.',
    confidence: 'medium',
  },
  {
    id: 'latin-in-lyrics',
    test: (t) => [...t.matchAll(/[A-Za-z]{2,}/g)],
    note: 'Latin letters in lyric text (excluding YAML keys).',
    confidence: 'high',
  },
  {
    id: 'pipe-in-text',
    test: (t) => [...t.matchAll(/\|/g)],
    note: 'Stray pipe character in text (unusual in lyrics).',
    confidence: 'high',
  },
  {
    id: 'triple-vowel',
    test: (t) => [...t.matchAll(/कछूु|ूु/g)],
    note: 'Repeated matra / typo (e.g. कछूु → कछु).',
    suggest: 'कछु',
    confidence: 'high',
  },
  {
    id: 'mrilulok',
    test: (t) => [...t.matchAll(/मृलुलोक/g)],
    note: 'Likely मर्त्यलोक (earth) — extra लु.',
    suggest: 'मर्त्यलोक',
    confidence: 'high',
  },
  {
    id: 'bagsse',
    test: (t) => [...t.matchAll(/बग्से/g)],
    note: 'Likely बढ़े (increase) in “सुख संपति बढ़े”.',
    suggest: 'बढ़े',
    confidence: 'high',
  },
  {
    id: 'poshal',
    test: (t) => [...t.matchAll(/पोशाल/g)],
    note: 'Likely पोशाक (clothes/uniform) — “एक पोशाक”.',
    suggest: 'पोशाक',
    confidence: 'medium',
  },
  {
    id: 'gafil',
    test: (t) => [...t.matchAll(/गाफिल/g)],
    note: 'Often गाफ़िल / बेपरवाह — verify spelling.',
    confidence: 'low',
  },
];

/** Pairs: if both appear in corpus, flag inconsistency */
const INCONSISTENT_GROUPS = [
  { label: 'Bhairav deity name', forms: ['भैरव', 'भैरु', 'भैरू', 'भैंरु'] },
  { label: 'Heart', forms: ['हृदय', 'ह्रदय', 'हृदयं'] },
  { label: 'Ram spelling', forms: ['रामचंद्र', 'रामचन्द्र'] },
  { label: 'Amba spelling', forms: ['अम्बे', 'अंबे', 'अम्बा', 'अंबा'] },
  { label: 'Choor / prasad (regional)', forms: ['चूरमो', 'चूर', 'चूर्ण'] },
  { label: 'Desa / offering', forms: ['देसां', 'देंसा', 'देसा'] },
];

function bhajanTexts(data) {
  const lyrics =
    typeof data.lyrics === 'string' ? data.lyrics : flattenLyricsText(data.lyrics);
  return {
    title: data.title || '',
    tarz: data.tarz || '',
    lyrics: lyrics || '',
    dhvani: data.dhvani || '',
    jabani: data.jabani || '',
  };
}

function lineHits(text, field, rel, pattern) {
  const hits = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const m = pattern.test(line);
    if (m && m.length) {
      for (const match of m) {
        hits.push({
          path: rel,
          field,
          lineNum: i + 1,
          excerpt: line.trim().slice(0, 120),
          match: match[0] || match,
          patternId: pattern.id,
          note: pattern.note,
          suggest: pattern.suggest,
          confidence: pattern.confidence,
        });
      }
    }
  }
  return hits;
}

function main() {
  const config = loadSections();
  const allHits = [];
  const formCounts = new Map();

  const duplicateJabani = [];

  for (const section of config.sections) {
    for (const file of listBhajanFiles(section)) {
      const rel = `${section.slug}/${file}`;
      const data = loadBhajan(path.join(sectionFolder(section), file));
      const texts = bhajanTexts(data);

      if (texts.jabani && texts.jabani.length > 200) {
        const chunks = texts.jabani.split(/[।.!?]\s+/).filter((c) => c.length > 40);
        const seen = new Map();
        for (const c of chunks) {
          const norm = c.trim().slice(0, 80);
          if (seen.has(norm)) {
            duplicateJabani.push({ path: rel, excerpt: norm.slice(0, 100) });
          }
          seen.set(norm, true);
        }
      }

      for (const [field, text] of Object.entries(texts)) {
        if (!text.trim()) continue;

        for (const pattern of PATTERNS) {
          allHits.push(...lineHits(text, field, rel, pattern));
        }

        for (const group of INCONSISTENT_GROUPS) {
          for (const form of group.forms) {
            if (text.includes(form)) {
              const key = `${group.label}::${form}`;
              if (!formCounts.has(key)) formCounts.set(key, []);
              formCounts.get(key).push(rel);
            }
          }
        }
      }
    }
  }

  const byConfidence = { high: [], medium: [], low: [] };
  for (const h of allHits) {
    byConfidence[h.confidence].push(h);
  }

  const lines = [];
  lines.push('# Misspelling analysis report (read-only)');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push(
    'Automated scan plus linguistic notes. **No YAML files were modified.**'
  );
  lines.push('');
  lines.push(
    'Legend: **High** = likely error in standard Hindi/Sanskrit devotional text; **Medium** = probable typo or non-standard form worth checking; **Low** = often intentional (Rajasthani, repetition markers, dialect).'
  );
  lines.push('');

  for (const level of ['high', 'medium', 'low']) {
    const items = byConfidence[level];
    lines.push(`## ${level.charAt(0).toUpperCase() + level.slice(1)} confidence (${items.length} hits)`);
    lines.push('');
    if (!items.length) {
      lines.push('_None._');
      lines.push('');
      continue;
    }
    const grouped = new Map();
    for (const h of items) {
      const k = `${h.patternId}\t${h.match}\t${h.suggest || ''}`;
      if (!grouped.has(k)) grouped.set(k, { meta: h, refs: [] });
      grouped.get(k).refs.push(h);
    }
    for (const { meta, refs } of grouped.values()) {
      lines.push(`### \`${meta.match}\`${meta.suggest ? ` → \`${meta.suggest}\`` : ''}`);
      lines.push('');
      lines.push(meta.note);
      lines.push('');
      const byFile = new Map();
      for (const r of refs) {
        const fk = `${r.path} (${r.field}, line ${r.lineNum})`;
        if (!byFile.has(fk)) byFile.set(fk, r.excerpt);
      }
      for (const [fk, ex] of byFile) {
        lines.push(`- **${fk}**`);
        lines.push(`  > ${ex}`);
      }
      lines.push('');
    }
  }

  lines.push('## Inconsistent spellings across the corpus');
  lines.push('');
  for (const group of INCONSISTENT_GROUPS) {
    const present = group.forms.filter((f) => formCounts.has(`${group.label}::${f}`));
    if (present.length < 2) continue;
    lines.push(`### ${group.label}`);
    lines.push('');
    for (const form of present) {
      const refs = formCounts.get(`${group.label}::${form}`);
      const sample = refs.slice(0, 5).join(', ');
      const more = refs.length > 5 ? ` (+${refs.length - 5} more)` : '';
      lines.push(`- **${form}** — ${refs.length} file(s): ${sample}${more}`);
    }
    lines.push('');
  }

  if (duplicateJabani.length) {
    lines.push('## Duplicate / repeated jabani passages');
    lines.push('');
    for (const d of duplicateJabani) {
      lines.push(`- **${d.path}** — repeated chunk: “${d.excerpt}…”`);
    }
    lines.push('');
  }

  lines.push('## Manual review notes (AI)');
  lines.push('');
  lines.push('These items need human judgment — many **bhairav** / **mooltatva** lines use **Marwari/Rajasthani** forms that are correct in context:');
  lines.push('');
  lines.push('| Form | Notes |');
  lines.push('|------|--------|');
  lines.push('| चूरमो, चूर | Regional for चूर्ण (sacred powder); likely intentional |');
  lines.push('| भैरु, भैरू | Regional Bhairav; not necessarily भैरव |');
  lines.push('| देसां, हांँ | Dialect particles / exclamations |');
  lines.push('| बालकिया, लांकडिया | Regional words in folk bhajans |');
  lines.push('| -२, -२रे | Verse-repeat notation from source transcription |');
  lines.push('| ‘मीनू’, ‘राम’ in quotes | Emphasis markers; remove curly quotes for cleaner tokens |');
  lines.push('| अर्द्धांगी, गरूड़ासन | Alternate orthography in printed aartis — compare with your reference book |');
  lines.push('| जयकारा, होली spellings | Festival/regional variants |');
  lines.push('| माय (title) | May be truncated माया in “जग में माया” — verify line meaning |');
  lines.push('| जगरें | Possibly जगत में / जग में |');
  lines.push('| शशाँक | Poetic variant of शशांक (moon); often kept in Shiva bhajans |');
  lines.push('| बल्लभम | Sanskrit vocative; standard stotra has बल्लभम् — optional fix |');
  lines.push('| चरणा / नवाय | Regional; standard Hindi चरण, निवाय/नमाएँ |');
  lines.push('| शोणितबीज, शुम्भ | Standard Durga lore spellings; keep unless source differs |');
  lines.push('| खपाय / खपायो | Regional past tense “destroyed” |');
  lines.push('');
  lines.push('### Recommended next steps');
  lines.push('');
  lines.push('1. Fix **high-confidence** items first (ह्रदय, अच्चुत, पढया, होतरे, glued `-२रे`).');
  lines.push('2. For **bhairav** section, confirm with audio/source before “correcting” dialect.');
  lines.push('3. Add confirmed valid words to `dictionary.txt` to reduce noise in spellcheck UI.');
  lines.push('4. Normalize smart quotes to plain text or none.');
  lines.push('');

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
  console.log(`Report written: ${OUT}`);
  console.log(`  High: ${byConfidence.high.length}, Medium: ${byConfidence.medium.length}, Low: ${byConfidence.low.length}`);
}

main();
