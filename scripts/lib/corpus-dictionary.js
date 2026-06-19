const fs = require('fs');
const path = require('path');
const { ROOT } = require('./paths');
const { loadSections, sectionFolder, listBhajanFiles, loadBhajan, isBhajanSection } = require('./sections');
const { collectFields } = require('../../admin/lib/bhajan-text-fields');
const { tokenizeHindiForSpell } = require('./spell-tokens');

const ADMIN_PUBLIC = path.join(ROOT, 'admin', 'public');
const JSON_OUT = path.join(ADMIN_PUBLIC, 'corpus-dictionary.json');
const DIC_OUT = path.join(ADMIN_PUBLIC, 'corpus.dic');

/** Sections with heavy Marwari / regional Rajasthani usage */
const MARWARI_SECTIONS = new Set(['horiya', 'mooltatva', 'ambikacharitra']);

const MIN_WORD_LEN = 2;

function collectWordsFromConfig(config) {
  const allWords = new Set();
  const bySection = {};
  let bhajanCount = 0;

  for (const section of config.sections || []) {
    const sectionWords = new Set();
    for (const file of listBhajanFiles(section)) {
      if (isBhajanSection(section)) bhajanCount += 1;
      const doc = loadBhajan(path.join(sectionFolder(section), file));
      for (const { text } of collectFields(doc)) {
        for (const w of tokenizeHindiForSpell(text, MIN_WORD_LEN)) {
          allWords.add(w);
          sectionWords.add(w);
        }
      }
    }
    bySection[section.slug] = sectionWords.size;
  }

  const marwariWords = new Set();
  for (const section of config.sections || []) {
    if (!MARWARI_SECTIONS.has(section.slug)) continue;
    for (const file of listBhajanFiles(section)) {
      const doc = loadBhajan(path.join(sectionFolder(section), file));
      for (const { text } of collectFields(doc)) {
        for (const w of tokenizeHindiForSpell(text, MIN_WORD_LEN)) {
          marwariWords.add(w);
        }
      }
    }
  }

  return {
    words: [...allWords].sort((a, b) => a.localeCompare(b, 'hi')),
    marwariWords: [...marwariWords].sort((a, b) => a.localeCompare(b, 'hi')),
    bhajanCount,
    bySection,
  };
}

function writeHunspellDic(words, destPath) {
  const lines = [String(words.length), ...words];
  fs.writeFileSync(destPath, `${lines.join('\n')}\n`, 'utf8');
}

/** Build admin/public/corpus-dictionary.json and corpus.dic from content/. */
function writeCorpusDictionary(config = loadSections()) {
  const { words, marwariWords, bhajanCount, bySection } = collectWordsFromConfig(config);

  fs.mkdirSync(ADMIN_PUBLIC, { recursive: true });

  const payload = {
    generated: new Date().toISOString(),
    bhajanCount,
    uniqueWords: words.length,
    marwariSectionWords: marwariWords.length,
    marwariSections: [...MARWARI_SECTIONS],
    wordsBySection: bySection,
    words,
  };
  fs.writeFileSync(JSON_OUT, `${JSON.stringify(payload)}\n`, 'utf8');
  writeHunspellDic(words, DIC_OUT);

  console.log(
    `Corpus dictionary: ${words.length} words from ${bhajanCount} bhajans → ${JSON_OUT}`,
  );
  console.log(`  Hunspell extension: ${DIC_OUT} (${marwariWords.length} words in Marwari-heavy sections)`);

  return { words, jsonPath: JSON_OUT, dicPath: DIC_OUT };
}

module.exports = {
  MARWARI_SECTIONS,
  collectWordsFromConfig,
  writeCorpusDictionary,
  JSON_OUT,
  DIC_OUT,
};
