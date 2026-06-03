/**
 * Find Devanagari word forms that likely mean the same thing but are spelled differently.
 * Report only by default; apply via output/spelling-choices.json + --apply.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ROOT } = require('./paths');
const { loadSections, sectionFolder, listBhajanFiles, loadBhajan } = require('./sections');
const { dumpBhajanDoc } = require('./yaml-io');
const { isStructuredLyrics } = require('./lyrics-structure');

const MIN_WORD_LEN = 2;
const MAX_WORD_LEN = 30;
const MIN_FORM_COUNT = 2;
const MIN_TOTAL_OCCURRENCES = 4;
const MIN_EDIT_CLUSTER_FREQ = 2;

/** Very common grammar — usually not spelling standardization targets */
const SKIP_WORDS = new Set([
  'के',
  'में',
  'से',
  'को',
  'पर',
  'और',
  'ही',
  'भी',
  'यह',
  'वह',
  'कि',
  'ना',
  'ने',
  'तो',
  'जो',
  'का',
  'की',
  'एक',
  'सब',
  'जो',
  'तब',
  'जब',
  'वो',
  'हो',
  'था',
  'थी',
  'थे',
  'रहे',
  'कर',
  'करे',
  'किया',
  'गया',
  'गये',
  'हुआ',
  'हुई',
  'हुए',
  'है',
  'हैं',
  'था',
  'थी',
]);

const VOWEL_SIGN = /^[\u093A-\u094F\u094D\u0951-\u0954]$/u;

function collectFields(doc) {
  const out = [];
  if (doc.title) out.push({ field: 'title', text: String(doc.title) });
  if (doc.tarz) out.push({ field: 'tarz', text: String(doc.tarz) });
  if (doc.jabani) out.push({ field: 'jabani', text: String(doc.jabani) });
  const lyrics = doc.lyrics;
  if (!lyrics) return out;
  if (!isStructuredLyrics(lyrics)) {
    out.push({ field: 'lyrics', text: String(lyrics) });
    return out;
  }
  if (lyrics.tarz) out.push({ field: 'lyrics.tarz', text: String(lyrics.tarz) });
  if (lyrics.sthayi) out.push({ field: 'lyrics.sthayi', text: String(lyrics.sthayi) });
  if (lyrics.pre_shlok) out.push({ field: 'lyrics.pre_shlok', text: String(lyrics.pre_shlok) });
  if (lyrics.dhvani) out.push({ field: 'lyrics.dhvani', text: String(lyrics.dhvani) });
  (lyrics.paragraphs || []).forEach((p, i) => {
    if (p) out.push({ field: `lyrics.paragraphs[${i}]`, text: String(p) });
  });
  return out;
}

function tokenize(text) {
  const re = /[\u0900-\u097F]+/gu;
  const words = [];
  let m;
  while ((m = re.exec(String(text || ''))) !== null) {
    const w = m[0];
    if (w.length >= MIN_WORD_LEN && w.length <= MAX_WORD_LEN && !SKIP_WORDS.has(w)) {
      words.push(w);
    }
  }
  return words;
}

function devaSkeleton(word) {
  return [...word].filter((ch) => !VOWEL_SIGN.test(ch)).join('');
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const row = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[n];
}

function clusterId(forms) {
  return crypto.createHash('md5').update([...forms].sort().join('|')).digest('hex').slice(0, 12);
}

function scanCorpus(config) {
  /** @type {Map<string, { count: number, refs: Array<{path,title,field}> }>} */
  const wordIndex = new Map();

  for (const section of config.sections || []) {
    for (const file of listBhajanFiles(section)) {
      const fp = path.join(sectionFolder(section), file);
      const doc = loadBhajan(fp);
      const rel = path.relative(ROOT, fp).replace(/\\/g, '/');
      const title = doc.title || file;
      for (const { field, text } of collectFields(doc)) {
        for (const word of tokenize(text)) {
          if (!wordIndex.has(word)) wordIndex.set(word, { count: 0, refs: [] });
          const e = wordIndex.get(word);
          e.count += 1;
          if (e.refs.length < 8) {
            e.refs.push({ path: rel, title, field, section: section.title });
          }
        }
      }
    }
  }

  return wordIndex;
}

function buildClusters(wordIndex) {
  const words = [...wordIndex.keys()].filter((w) => wordIndex.get(w).count >= MIN_EDIT_CLUSTER_FREQ);
  const parent = new Map(words.map((w) => [w, w]));

  function find(x) {
    let p = parent.get(x);
    while (p !== parent.get(p)) {
      parent.set(x, parent.get(p));
      p = parent.get(p);
    }
    return p;
  }

  function unite(a, b) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  }

  const bySkeleton = new Map();
  for (const w of words) {
    const sk = devaSkeleton(w);
    if (!bySkeleton.has(sk)) bySkeleton.set(sk, []);
    bySkeleton.get(sk).push(w);
  }

  for (const group of bySkeleton.values()) {
    if (group.length < 2) continue;
    for (let i = 1; i < group.length; i++) unite(group[0], group[i]);
  }

  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j < words.length; j++) {
      const a = words[i];
      const b = words[j];
      if (find(a) === find(b)) continue;
      const la = a.length;
      const lb = b.length;
      if (Math.abs(la - lb) > 2) continue;
      const maxDist = la <= 4 || lb <= 4 ? 1 : 2;
      if (levenshtein(a, b) <= maxDist) unite(a, b);
    }
  }

  const groups = new Map();
  for (const w of words) {
    const root = find(w);
    if (!groups.has(root)) groups.set(root, new Set());
    groups.get(root).add(w);
  }

  const clusters = [];
  for (const formsSet of groups.values()) {
    const forms = [...formsSet];
    if (forms.length < MIN_FORM_COUNT) continue;

    const variants = forms
      .map((form) => ({
        form,
        count: wordIndex.get(form).count,
        samples: wordIndex.get(form).refs.slice(0, 5),
      }))
      .sort((a, b) => b.count - a.count);

    const total = variants.reduce((n, v) => n + v.count, 0);
    if (total < MIN_TOTAL_OCCURRENCES) continue;

    const canonical = variants[0].form;
    const id = clusterId(forms);
    clusters.push({
      id,
      canonical,
      total,
      variants,
      skeleton: devaSkeleton(canonical),
    });
  }

  clusters.sort((a, b) => b.total - a.total);
  return clusters;
}

function defaultChoices(clusters) {
  const decisions = {};
  for (const c of clusters) {
    decisions[c.id] = {
      action: 'ignore',
      canonical: c.canonical,
      replace: c.variants.map((v) => v.form).filter((f) => f !== c.canonical),
    };
  }
  return { version: 1, updated: new Date().toISOString(), decisions };
}

function loadChoices(filePath, clusters) {
  if (!fs.existsSync(filePath)) return defaultChoices(clusters);
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const base = defaultChoices(clusters);
    if (data.decisions && typeof data.decisions === 'object') {
      for (const c of clusters) {
        if (data.decisions[c.id]) {
          base.decisions[c.id] = {
            ...base.decisions[c.id],
            ...data.decisions[c.id],
            replace: c.variants.map((v) => v.form).filter((f) => f !== (data.decisions[c.id].canonical || c.canonical)),
          };
        }
      }
      base.updated = data.updated || base.updated;
    }
    return base;
  } catch {
    return defaultChoices(clusters);
  }
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceWholeWord(text, from, to) {
  if (!from || from === to) return text;
  const re = new RegExp(`(?<![\\u0900-\\u097F])${escapeRegex(from)}(?![\\u0900-\\u097F])`, 'gu');
  return String(text).replace(re, to);
}

function applyFixToDoc(doc, field, newText) {
  if (field === 'title') {
    doc.title = newText;
    return;
  }
  if (field === 'tarz') {
    doc.tarz = newText;
    return;
  }
  if (field === 'jabani') {
    doc.jabani = newText;
    return;
  }
  if (field === 'lyrics' && typeof doc.lyrics === 'string') {
    doc.lyrics = newText;
    return;
  }
  if (!isStructuredLyrics(doc.lyrics)) return;
  if (field === 'lyrics.tarz') doc.lyrics.tarz = newText;
  else if (field === 'lyrics.sthayi') doc.lyrics.sthayi = newText;
  else if (field === 'lyrics.pre_shlok') doc.lyrics.pre_shlok = newText;
  else if (field === 'lyrics.dhvani') doc.lyrics.dhvani = newText;
  else {
    const m = field.match(/^lyrics\.paragraphs\[(\d+)\]$/);
    if (m) {
      const i = Number(m[1]);
      if (!doc.lyrics.paragraphs) doc.lyrics.paragraphs = [];
      doc.lyrics.paragraphs[i] = newText;
    }
  }
}

function applyChoices(config, choices) {
  const replacements = [];
  for (const [id, d] of Object.entries(choices.decisions || {})) {
    if (d.action !== 'fix') continue;
    const canonical = d.canonical;
    for (const from of d.replace || []) {
      if (from && from !== canonical) replacements.push({ id, from, to: canonical });
    }
  }
  if (!replacements.length) {
    return { filesUpdated: 0, replacements: 0 };
  }

  let filesUpdated = 0;
  let replacementCount = 0;

  for (const section of config.sections || []) {
    for (const file of listBhajanFiles(section)) {
      const fp = path.join(sectionFolder(section), file);
      const doc = loadBhajan(fp);
      let changed = false;
      for (const { field, text } of collectFields(doc)) {
        let next = text;
        for (const { from, to } of replacements) {
          const updated = replaceWholeWord(next, from, to);
          if (updated !== next) {
            replacementCount += 1;
            next = updated;
          }
        }
        if (next !== text) {
          applyFixToDoc(doc, field, next);
          changed = true;
        }
      }
      if (changed) {
        fs.writeFileSync(fp, dumpBhajanDoc(doc), 'utf8');
        filesUpdated += 1;
      }
    }
  }

  return { filesUpdated, replacements: replacementCount };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderHtmlReport(clusters, choices) {
  const dataJson = JSON.stringify({ clusters, choices }).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="hi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Spelling variant report</title>
<style>
  :root { --bg: #faf6f0; --surface: #fffdf9; --text: #2c1810; --muted: #5c4a42; --accent: #9b2d4a; --border: #e0d0c4; }
  * { box-sizing: border-box; }
  body { font-family: "Noto Sans Devanagari", system-ui, sans-serif; margin: 0; padding: 1rem 1.25rem 2.5rem; background: var(--bg); color: var(--text); line-height: 1.55; }
  h1 { font-size: 1.35rem; margin: 0 0 0.5rem; }
  .toolbar { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin: 1rem 0; padding: 0.75rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
  button, .btn { font: inherit; cursor: pointer; padding: 0.45rem 0.85rem; border-radius: 6px; border: 1px solid var(--border); background: var(--surface); color: var(--text); }
  button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
  .summary { color: var(--muted); margin-bottom: 0.75rem; }
  .cluster { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1rem 1.1rem; margin-bottom: 1rem; }
  .cluster.fix-selected { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .cluster.ignored { opacity: 0.72; }
  .cluster h2 { margin: 0 0 0.5rem; font-size: 1.05rem; color: var(--accent); }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; margin: 0.5rem 0; }
  th, td { text-align: left; padding: 0.35rem 0.5rem; border-bottom: 1px solid var(--border); vertical-align: top; }
  .actions { display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; margin-top: 0.75rem; }
  .actions label { display: inline-flex; align-items: center; gap: 0.35rem; cursor: pointer; }
  select { font: inherit; padding: 0.3rem 0.5rem; border-radius: 4px; border: 1px solid var(--border); }
  .samples { font-size: 0.82rem; color: var(--muted); }
  .help { font-size: 0.88rem; color: var(--muted); max-width: 42rem; }
  code { background: #f0e8dc; padding: 0.1em 0.35em; border-radius: 3px; font-size: 0.88em; }
  #import-file { display: none; }
</style>
</head>
<body>
<h1>Spelling variants across bhajans</h1>
<p class="help">Same word spelled different ways. Choose <strong>Fix</strong> (standardize to one form) or <strong>Ignore</strong> for each group. Download choices, then run <code>npm run spelling-report -- --apply</code>. No files are changed until you apply.</p>
<p class="summary" id="summary"></p>
<div class="toolbar">
  <button type="button" class="primary" id="btn-download">Download choices JSON</button>
  <button type="button" id="btn-import">Load choices JSON</button>
  <input type="file" id="import-file" accept="application/json,.json">
  <button type="button" id="btn-ignore-all">Ignore all</button>
</div>
<div id="clusters"></div>
<script type="application/json" id="spelling-payload">${dataJson}</script>
<script>
(function () {
  const payload = JSON.parse(document.getElementById('spelling-payload').textContent);
  const clusters = payload.clusters;
  let choices = payload.choices;

  function ensureDecision(id, cluster) {
    if (!choices.decisions[id]) {
      choices.decisions[id] = {
        action: 'ignore',
        canonical: cluster.canonical,
        replace: cluster.variants.map(v => v.form).filter(f => f !== cluster.canonical)
      };
    }
    return choices.decisions[id];
  }

  function updateSummary() {
    const fix = Object.values(choices.decisions).filter(d => d.action === 'fix').length;
    const ign = clusters.length - fix;
    document.getElementById('summary').textContent =
      clusters.length + ' group(s): ' + fix + ' to fix, ' + ign + ' ignored.';
  }

  function render() {
    const root = document.getElementById('clusters');
    root.innerHTML = '';
    clusters.forEach((c, idx) => {
      const d = ensureDecision(c.id, c);
      const el = document.createElement('section');
      el.className = 'cluster ' + (d.action === 'fix' ? 'fix-selected' : 'ignored');
      el.dataset.id = c.id;

      const rows = c.variants.map(v =>
        '<tr><td><strong>' + esc(v.form) + '</strong></td><td>' + v.count + '</td><td class="samples">' +
        esc(v.samples.map(s => s.title).join('; ')) + '</td></tr>'
      ).join('');

      const opts = c.variants.map(v =>
        '<option value="' + esc(v.form) + '"' + (v.form === d.canonical ? ' selected' : '') + '>' +
        esc(v.form) + ' (' + v.count + ')</option>'
      ).join('');

      el.innerHTML =
        '<h2>#' + (idx + 1) + ' · ' + esc(c.variants.map(v => v.form).join(' / ')) + '</h2>' +
        '<p>Total occurrences: <strong>' + c.total + '</strong> · skeleton: <code>' + esc(c.skeleton) + '</code></p>' +
        '<table><thead><tr><th>Form</th><th>Count</th><th>Sample bhajans</th></tr></thead><tbody>' + rows + '</tbody></table>' +
        '<div class="actions">' +
        '<label><input type="radio" name="act-' + c.id + '" value="fix" ' + (d.action === 'fix' ? 'checked' : '') + '> Fix (standardize)</label>' +
        '<label><input type="radio" name="act-' + c.id + '" value="ignore" ' + (d.action === 'ignore' ? 'checked' : '') + '> Ignore</label>' +
        '<label>Standard form: <select data-canonical="' + c.id + '">' + opts + '</select></label>' +
        '</div>';

      root.appendChild(el);

      el.querySelectorAll('input[type=radio]').forEach(r => {
        r.addEventListener('change', () => {
          d.action = r.value;
          d.replace = c.variants.map(v => v.form).filter(f => f !== d.canonical);
          el.className = 'cluster ' + (d.action === 'fix' ? 'fix-selected' : 'ignored');
          choices.updated = new Date().toISOString();
          updateSummary();
        });
      });
      el.querySelector('select').addEventListener('change', e => {
        d.canonical = e.target.value;
        d.replace = c.variants.map(v => v.form).filter(f => f !== d.canonical);
        choices.updated = new Date().toISOString();
      });
    });
    updateSummary();
  }

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  document.getElementById('btn-download').addEventListener('click', () => {
    choices.updated = new Date().toISOString();
    const blob = new Blob([JSON.stringify(choices, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'spelling-choices.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });
  document.getElementById('import-file').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const loaded = JSON.parse(r.result);
        if (loaded.decisions) {
          choices.decisions = { ...choices.decisions, ...loaded.decisions };
          choices.updated = loaded.updated || new Date().toISOString();
          render();
        }
      } catch (err) { alert('Invalid JSON: ' + err.message); }
    };
    r.readAsText(f);
  });

  document.getElementById('btn-ignore-all').addEventListener('click', () => {
    clusters.forEach(c => { ensureDecision(c.id, c).action = 'ignore'; });
    choices.updated = new Date().toISOString();
    render();
  });

  render();
})();
</script>
</body>
</html>`;
}

function renderMarkdownReport(clusters, choices) {
  const lines = [
    '# Spelling variant report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `**${clusters.length}** variant group(s). Open \`output/spelling-report.html\` to choose Fix or Ignore per group.`,
    '',
    'Apply fixes: save `spelling-choices.json` from the report, place in `output/`, then:',
    '',
    '```bash',
    'npm run spelling-report -- --apply',
    '```',
    '',
    '---',
    '',
  ];
  for (const [i, c] of clusters.entries()) {
    const d = choices.decisions[c.id] || { action: 'ignore', canonical: c.canonical };
    lines.push(`## ${i + 1}. ${c.variants.map((v) => v.form).join(' / ')}`);
    lines.push('');
    lines.push(`- **Suggested standard:** ${d.canonical}`);
    lines.push(`- **Total hits:** ${c.total}`);
    lines.push('');
    lines.push('| Form | Count |');
    lines.push('|------|-------|');
    for (const v of c.variants) {
      lines.push(`| ${v.form} | ${v.count} |`);
    }
    lines.push('');
    lines.push('Sample bhajans: ' + c.variants[0].samples.map((s) => s.title).join(', '));
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  if (!clusters.length) lines.push('No variant groups matched current thresholds.');
  return lines.join('\n');
}

module.exports = {
  scanCorpus,
  buildClusters,
  defaultChoices,
  loadChoices,
  applyChoices,
  renderHtmlReport,
  renderMarkdownReport,
};
