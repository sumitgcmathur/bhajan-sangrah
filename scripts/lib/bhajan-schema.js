const fs = require('fs');
const path = require('path');
const { ROOT } = require('./paths');
const { loadBhajanDoc } = require('./yaml-io');
const { sectionFolder, listBhajanFiles } = require('./sections');

/** Top-level bhajan YAML keys the parser accepts */
const DOC_KEYS = new Set([
  'title',
  'tarz',
  'group',
  'swarachit',
  'lyrics',
  'jabani',
  'pre_shlok',
  'dhvani',
  'shlok',
]);

/** Keys allowed under `lyrics:` (structured) */
const LYRICS_KEYS = new Set([
  'parts',
  'sthayi',
  'paragraphs',
  'sthayi_connect',
  'sthayi_connect_text',
  'pre_shlok',
  'pre_sthayi',
  'dhvani',
  'shlok',
  'jabani',
]);

/** Keys allowed on each item under `lyrics.parts` */
const PART_KEYS = new Set([
  'sthayi',
  'paragraphs',
  'sthayi_connect',
  'sthayi_connect_text',
  'pre_shlok',
  'dhvani',
]);

const DEPRECATED_KEYS = {
  pre_sthayi: 'pre_shlok',
};

function stripBom(text) {
  return String(text || '').replace(/^\uFEFF/, '');
}

function normalizeLines(text) {
  return stripBom(text).replace(/\r\n/g, '\n').split('\n');
}

/** True when a `key: |` block (or inline scalar) has non-whitespace content */
function yamlFieldHasContent(lines, keyEntry) {
  const raw = lines[keyEntry.line - 1] || '';
  if (!raw.includes('|')) {
    return Boolean(raw.replace(/^[\s\uFEFF]*[a-zA-Z_][\w-]*:\s*/, '').trim());
  }
  const keyIndent = (raw.match(/^(\s*)/) || ['', ''])[1].length;
  for (let i = keyEntry.line; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;
    const indent = (line.match(/^(\s*)/) || ['', ''])[1].length;
    if (indent <= keyIndent && /^[a-zA-Z_]/.test(line.trim())) break;
    if (line.trim()) return true;
  }
  return false;
}

function scanTopLevelKeys(lines) {
  const keys = [];
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const m = raw.match(/^([a-zA-Z_][\w-]*):/);
    if (m) keys.push({ key: m[1], line: i + 1 });
  }
  return keys;
}

function scanStructuredLyrics(lines, startIdx) {
  const keys = [];
  const parts = [];
  let i = startIdx;
  let currentPart = null;

  while (i < lines.length) {
    const raw = lines[i];
    if (!raw.trim()) {
      i += 1;
      continue;
    }
    if (/^[a-zA-Z_][\w-]*:\s/.test(raw) && !raw.startsWith('  ')) break;

    const key2 = raw.match(/^  ([a-zA-Z_][\w-]*):/);
    if (key2) {
      keys.push({ key: key2[1], line: i + 1 });
      if (key2[1] === 'parts') {
        i += 1;
        while (i < lines.length) {
          const pr = lines[i];
          if (!pr.trim()) {
            i += 1;
            continue;
          }
          if (pr.match(/^  [a-zA-Z_][\w-]*:/)) break;
          if (pr.match(/^    -\s/)) {
            if (currentPart) parts.push(currentPart);
            currentPart = { keys: [], line: i + 1 };
            i += 1;
            continue;
          }
          const key6 = pr.match(/^      ([a-zA-Z_][\w-]*):/);
          if (key6 && currentPart) {
            currentPart.keys.push({ key: key6[1], line: i + 1 });
          }
          i += 1;
        }
        if (currentPart) parts.push(currentPart);
        currentPart = null;
        continue;
      }
    }
    i += 1;
  }

  return { keys, parts };
}

function scanSource(text) {
  const lines = normalizeLines(text);
  const topLevel = scanTopLevelKeys(lines);
  let lyricsMode = 'missing';
  const lyricsKeys = [];
  const partItems = [];

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    if (raw.match(/^lyrics:\s*\|/)) {
      lyricsMode = 'string';
      break;
    }
    if (raw.match(/^lyrics:\s*$/)) {
      lyricsMode = 'structured';
      const scanned = scanStructuredLyrics(lines, i + 1);
      lyricsKeys.push(...scanned.keys);
      partItems.push(...scanned.parts);
      break;
    }
  }

  return { topLevel, lyricsMode, lyricsKeys, partItems };
}

function partHasContent(part) {
  if (!part) return false;
  if (String(part.sthayi || '').trim()) return true;
  if (String(part.pre_shlok || '').trim()) return true;
  if (String(part.dhvani || '').trim()) return true;
  return (part.paragraphs || []).some((item) => {
    if (item && typeof item === 'object' && item.commentary != null) {
      return Boolean(String(item.commentary).trim());
    }
    return Boolean(String(item || '').trim());
  });
}

function lyricsHasRenderableContent(lyrics) {
  if (!lyrics) return false;
  if (typeof lyrics === 'string') return Boolean(lyrics.trim());
  if (lyrics.parts?.length) return lyrics.parts.some(partHasContent);
  return partHasContent(lyrics);
}

function sourceHasParagraphs(source) {
  return source.lyricsKeys.some((k) => k.key === 'paragraphs')
    || source.partItems.some((p) => p.keys.some((k) => k.key === 'paragraphs'));
}

function parsedHasParagraphs(doc) {
  const lyrics = doc.lyrics;
  if (!lyrics || typeof lyrics !== 'object') return false;
  if (lyrics.parts?.length) {
    return lyrics.parts.some((p) => (p.paragraphs || []).length > 0);
  }
  return (lyrics.paragraphs || []).length > 0;
}

function issue(file, severity, code, message, line) {
  return { file, severity, code, message, line: line || null };
}

/** Validate one bhajan YAML file. Returns issue objects (does not throw). */
function validateBhajanYaml(text, relPath) {
  const issues = [];
  const add = (severity, code, message, line) => {
    issues.push(issue(relPath, severity, code, message, line));
  };

  if (String(text || '').charCodeAt(0) === 0xfeff) {
    add('warning', 'utf8_bom', 'UTF-8 BOM at file start — save as UTF-8 without BOM', 1);
  }

  const lines = normalizeLines(text);
  const source = scanSource(stripBom(text));
  const hasTitle = source.topLevel.some((k) => k.key === 'title');
  if (!hasTitle) add('error', 'missing_title', 'Missing required field: title');

  const titleKey = source.topLevel.find((k) => k.key === 'title');
  if (titleKey) {
    const titleLine = lines[titleKey.line - 1] || '';
    const titleVal = titleLine.replace(/^title:\s*/, '').trim();
    if (!titleVal) add('error', 'empty_title', 'title is empty', titleKey.line);
  }

  if (source.lyricsMode === 'missing') {
    add('error', 'missing_lyrics', 'Missing required field: lyrics');
  }

  for (const { key, line } of source.topLevel) {
    if (!DOC_KEYS.has(key)) {
      add('error', 'unknown_doc_key', `Unknown top-level key "${key}"`, line);
    }
  }

  for (const { key, line } of source.lyricsKeys) {
    if (!LYRICS_KEYS.has(key)) {
      add(
        'error',
        'unknown_lyrics_key',
        `Unknown lyrics key "${key}" — parser stops here and may drop following fields`,
        line,
      );
      continue;
    }
    if (DEPRECATED_KEYS[key]) {
      add(
        'warning',
        'deprecated_key',
        `Deprecated lyrics key "${key}" — use "${DEPRECATED_KEYS[key]}" instead`,
        line,
      );
    }
  }

  for (const part of source.partItems) {
    for (const { key, line } of part.keys) {
      if (!PART_KEYS.has(key)) {
        add(
          'error',
          'unknown_part_key',
          `Unknown key "${key}" in lyrics.parts item`,
          line,
        );
      }
    }
  }

  let doc;
  try {
    doc = loadBhajanDoc(text);
  } catch (err) {
    add('error', 'parse_error', `YAML parse failed: ${err.message}`);
    return issues;
  }

  if (source.lyricsMode !== 'missing' && !lyricsHasRenderableContent(doc.lyrics)) {
    add('error', 'empty_lyrics', 'Lyrics parsed but contain no renderable text');
  }

  const fieldChecks = [
    ['sthayi', (d) => Boolean(String(d.lyrics?.sthayi || '').trim())],
    ['pre_shlok', (d) => Boolean(String(d.lyrics?.pre_shlok || '').trim())],
    ['dhvani', (d) => Boolean(String(d.lyrics?.dhvani || '').trim())],
    ['parts', (d) => Boolean(d.lyrics?.parts?.length)],
  ];

  for (const [key, hasParsed] of fieldChecks) {
    const src = source.lyricsKeys.find((k) => k.key === key);
    if (!src || !yamlFieldHasContent(lines, src)) continue;
    if (!hasParsed(doc)) {
      add(
        'error',
        'parse_drop',
        `"${key}" is present in YAML but was not parsed (check for unknown keys above it)`,
        src.line,
      );
    }
  }

  if (sourceHasParagraphs(source) && !parsedHasParagraphs(doc)) {
    const src = source.lyricsKeys.find((k) => k.key === 'paragraphs')
      || source.partItems.flatMap((p) => p.keys).find((k) => k.key === 'paragraphs');
    add(
      'error',
      'parse_drop',
      '"paragraphs" is present in YAML but was not parsed (check for unknown keys above it)',
      src?.line,
    );
  }

  return issues;
}

function validateAllBhajans(config) {
  const sections = config.sections || [];
  const byFile = [];

  for (const section of sections) {
    const folder = sectionFolder(section);
    for (const file of listBhajanFiles(section)) {
      const abs = path.join(folder, file);
      const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
      const text = fs.readFileSync(abs, 'utf8');
      const issues = validateBhajanYaml(text, rel);
      if (issues.length) byFile.push({ file: rel, section: section.slug, issues });
    }
  }

  return byFile;
}

function countIssues(byFile) {
  let errors = 0;
  let warnings = 0;
  for (const entry of byFile) {
    for (const i of entry.issues) {
      if (i.severity === 'error') errors += 1;
      else warnings += 1;
    }
  }
  return { files: byFile.length, errors, warnings };
}

function renderMarkdownReport(byFile) {
  const { files, errors, warnings } = countIssues(byFile);
  const lines = [
    '# Bhajan YAML schema report',
    '',
    `Files with issues: **${files}** · Errors: **${errors}** · Warnings: **${warnings}**`,
    '',
  ];

  if (!byFile.length) {
    lines.push('No schema issues found.');
    return `${lines.join('\n')}\n`;
  }

  for (const entry of byFile) {
    lines.push(`## ${entry.file}`);
    lines.push('');
    for (const i of entry.issues) {
      const loc = i.line ? ` (line ${i.line})` : '';
      lines.push(`- **${i.severity}** \`${i.code}\`${loc}: ${i.message}`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function printSchemaWarnings(byFile, opts = {}) {
  const { errors, warnings } = countIssues(byFile);
  if (!byFile.length) {
    console.log('Schema: all bhajan YAML files OK');
    return;
  }

  console.log(`Schema: ${byFile.length} file(s) with issues (${errors} error(s), ${warnings} warning(s))`);
  for (const entry of byFile) {
    for (const i of entry.issues) {
      const loc = i.line ? `:${i.line}` : '';
      const msg = `${i.file}${loc} [${i.code}] ${i.message}`;
      if (i.severity === 'error') {
        console.error(`  error: ${msg}`);
        if (opts.githubActions) {
          console.log(`::error file=${i.file},line=${i.line || 1}::${i.message}`);
        }
      } else {
        console.warn(`  warn:  ${msg}`);
        if (opts.githubActions) {
          console.log(`::warning file=${i.file},line=${i.line || 1}::${i.message}`);
        }
      }
    }
  }
}

function writeSchemaReport(byFile, outDir) {
  const dir = outDir || path.join(ROOT, 'output');
  fs.mkdirSync(dir, { recursive: true });
  const mdPath = path.join(dir, 'schema-report.md');
  fs.writeFileSync(mdPath, renderMarkdownReport(byFile), 'utf8');
  return mdPath;
}

module.exports = {
  DOC_KEYS,
  LYRICS_KEYS,
  PART_KEYS,
  validateBhajanYaml,
  validateAllBhajans,
  printSchemaWarnings,
  writeSchemaReport,
  renderMarkdownReport,
};
