/**
 * Scan bhajan YAML text for common OCR/typing issues; optional auto-fix.
 */
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./paths');
const { loadSections, sectionFolder, listBhajanFiles, loadBhajan } = require('./sections');
const { dumpBhajanDoc } = require('./yaml-io');
const { isStructuredLyrics } = require('./lyrics-structure');

const RULES = [
  {
    id: 'kachh_hum',
    label: 'कछ → कछु (before हम)',
    detect(text) {
      if (!/\bकछ\s+हम/u.test(text)) return null;
      return 'Use कछु not कछ before हम';
    },
    fix(text) {
      return text.replace(/\bकछ\s+हम/gu, 'कछु हम');
    },
  },
  {
    id: 'bhay_nai',
    label: 'नाई → नहीं (भय भी …)',
    detect(text) {
      if (!/भय\s+भी\s+नाई/u.test(text)) return null;
      return 'Use नहीं not नाई after भय भी';
    },
    fix(text) {
      return text.replace(/भय\s+भी\s+नाई/gu, 'भय भी नहीं');
    },
  },
  {
    id: 'mismatched_quotes',
    label: 'Mismatched quotation marks',
    detect(text) {
      const hits = [];
      const re = /'[^'"]*"|"[^"']*'/gu;
      let m;
      while ((m = re.exec(text)) !== null) {
        hits.push(m[0]);
      }
      if (!hits.length) return null;
      return `Mixed quotes: ${hits.map((h) => `«${h}»`).join(', ')}`;
    },
    fix(text) {
      return text
        .replace(/'([^'"]*)"/gu, "'$1'")
        .replace(/"([^"']*)'/gu, "'$1'");
    },
  },
  {
    id: 'shum_din',
    label: 'शुम दिन → शुभ दिन',
    detect(text) {
      if (!/\bशुम\s+दिन/u.test(text)) return null;
      return 'शुम दिन should be शुभ दिन (auspicious day), not शुंभ';
    },
    fix(text) {
      return text.replace(/\bशुम\s+दिन/gu, 'शुभ दिन');
    },
  },
];

function collectFields(doc) {
  const out = [];
  if (doc.title) out.push({ field: 'title', text: String(doc.title) });
  if (doc.tarz) out.push({ field: 'tarz', text: String(doc.tarz) });

  const lyrics = doc.lyrics;
  if (!lyrics) return out;
  if (!isStructuredLyrics(lyrics)) {
    out.push({ field: 'lyrics', text: String(lyrics) });
    return out;
  }
  if (lyrics.tarz) out.push({ field: 'lyrics.tarz', text: String(lyrics.tarz) });
  if (lyrics.sthayi) {
    out.push({ field: 'lyrics.sthayi', text: String(lyrics.sthayi) });
  }
  if (lyrics.pre_shlok) out.push({ field: 'lyrics.pre_shlok', text: String(lyrics.pre_shlok) });
  if (lyrics.post_shlok) out.push({ field: 'lyrics.post_shlok', text: String(lyrics.post_shlok) });
  const paras = lyrics.paragraphs || [];
  paras.forEach((p, i) => {
    if (p) out.push({ field: `lyrics.paragraphs[${i}]`, text: String(p) });
  });
  return out;
}

function scanField(fieldEntry, doc) {
  const issues = [];
  const ctx = { field: fieldEntry.field };
  for (const rule of RULES) {
    const detail = rule.detect(fieldEntry.text, ctx);
    if (!detail) continue;
    const fixed = rule.fix(fieldEntry.text, ctx);
    issues.push({
      ruleId: rule.id,
      label: rule.label,
      field: fieldEntry.field,
      detail,
      before: fieldEntry.text,
      after: fixed !== fieldEntry.text ? fixed : null,
      autoFixable: fixed !== fieldEntry.text,
    });
  }
  return issues;
}

function scanBhajan(section, fileName) {
  const fp = path.join(sectionFolder(section), fileName);
  const doc = loadBhajan(fp);
  const rel = path.relative(ROOT, fp).replace(/\\/g, '/');
  const fields = collectFields(doc);
  const issues = [];
  for (const f of fields) {
    for (const issue of scanField(f, doc)) {
      issues.push(issue);
    }
  }
  return {
    path: rel,
    sectionSlug: section.slug,
    sectionTitle: section.title,
    title: doc.title || fileName,
    fileName,
    issues,
  };
}

function scanAll(config) {
  const results = [];
  for (const section of config.sections || []) {
    for (const file of listBhajanFiles(section)) {
      const row = scanBhajan(section, file);
      if (row.issues.length) results.push(row);
    }
  }
  return results;
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
  if (field === 'lyrics.post_shlok') {
    doc.lyrics.post_shlok = newText;
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
  else if (field === 'lyrics.post_shlok') doc.lyrics.post_shlok = newText;
  else {
    const m = field.match(/^lyrics\.paragraphs\[(\d+)\]$/);
    if (m) {
      const i = Number(m[1]);
      if (!doc.lyrics.paragraphs) doc.lyrics.paragraphs = [];
      doc.lyrics.paragraphs[i] = newText;
    }
  }
}

function applyAutoFixes(config) {
  let filesUpdated = 0;
  let fixesApplied = 0;
  for (const section of config.sections || []) {
    for (const file of listBhajanFiles(section)) {
      const fp = path.join(sectionFolder(section), file);
      const doc = loadBhajan(fp);
      let changed = false;
      const fields = collectFields(doc);
      for (const f of fields) {
        let text = f.text;
        const ctx = { field: f.field };
        for (const rule of RULES) {
          if (!rule.detect(text, ctx)) continue;
          const next = rule.fix(text, ctx);
          if (next !== text) {
            text = next;
            fixesApplied += 1;
          }
        }
        if (text !== f.text) {
          applyFixToDoc(doc, f.field, text);
          changed = true;
        }
      }
      if (changed) {
        fs.writeFileSync(fp, dumpBhajanDoc(doc), 'utf8');
        filesUpdated += 1;
      }
    }
  }
  return { filesUpdated, fixesApplied };
}

function snippet(text, max = 120) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function renderMarkdownReport(results) {
  const total = results.reduce((n, r) => n + r.issues.length, 0);
  const lines = [
    '# Bhajan typo report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `**${results.length}** bhajans with **${total}** issue(s).`,
    '',
    'Auto-fix safe patterns: `npm run lint:typos -- --fix`',
    '',
    'Manual fix: open the bhajan in **admin** (same section → pick title) or edit the YAML path below.',
    '',
    '---',
    '',
  ];
  for (const row of results) {
    lines.push(`## ${row.title}`);
    lines.push('');
    lines.push(`- **Section:** ${row.sectionTitle} (\`${row.sectionSlug}\`)`);
    lines.push(`- **File:** \`${row.path}\``);
    lines.push('');
    for (const issue of row.issues) {
      lines.push(`### ${issue.label}`);
      lines.push('');
      lines.push(`- **Field:** \`${issue.field}\``);
      lines.push(`- **Note:** ${issue.detail}`);
      lines.push(`- **Current:** ${snippet(issue.before, 200)}`);
      if (issue.after) {
        lines.push(`- **Suggested:** ${snippet(issue.after, 200)}`);
        lines.push(`- **Auto-fix:** ${issue.autoFixable ? 'yes' : 'no'}`);
      }
      lines.push('');
    }
    lines.push('---');
    lines.push('');
  }
  if (!results.length) {
    lines.push('No issues found by current rules.');
  }
  return lines.join('\n');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderHtmlReport(results) {
  const total = results.reduce((n, r) => n + r.issues.length, 0);
  const cards = results
    .map((row) => {
      const items = row.issues
        .map(
          (issue) => `
        <article class="issue">
          <h3>${escapeHtml(issue.label)}</h3>
          <p class="meta"><strong>Field:</strong> <code>${escapeHtml(issue.field)}</code></p>
          <p>${escapeHtml(issue.detail)}</p>
          <p class="snippet"><strong>Current:</strong> ${escapeHtml(snippet(issue.before, 280))}</p>
          ${
            issue.after
              ? `<p class="snippet fix"><strong>Suggested:</strong> ${escapeHtml(snippet(issue.after, 280))}</p>`
              : ''
          }
        </article>`
        )
        .join('');
      return `
      <section class="bhajan" id="${escapeHtml(row.path.replace(/[^\w-]/g, '-'))}">
        <h2>${escapeHtml(row.title)}</h2>
        <p class="meta">${escapeHtml(row.sectionTitle)} · <code>${escapeHtml(row.path)}</code></p>
        ${items}
      </section>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="hi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bhajan typo report</title>
<style>
  body { font-family: "Noto Sans Devanagari", system-ui, sans-serif; margin: 0; padding: 1rem 1.25rem 2rem; background: #faf6f0; color: #2c1810; line-height: 1.55; }
  h1 { font-size: 1.35rem; margin: 0 0 0.5rem; }
  .summary { color: #5c4a42; margin-bottom: 1.25rem; }
  .bhajan { background: #fffdf9; border: 1px solid #e0d0c4; border-radius: 8px; padding: 1rem 1.1rem; margin-bottom: 1rem; }
  .bhajan h2 { margin: 0 0 0.35rem; font-size: 1.15rem; }
  .meta { margin: 0 0 0.75rem; font-size: 0.88rem; color: #5c4a42; }
  .issue { border-top: 1px solid #e0d0c4; padding-top: 0.75rem; margin-top: 0.75rem; }
  .issue h3 { margin: 0 0 0.35rem; font-size: 1rem; color: #6b1f32; }
  .snippet { font-size: 0.95rem; margin: 0.35rem 0; }
  .fix { color: #1a5c1a; }
  code { font-size: 0.85em; background: #f0e8dc; padding: 0.1em 0.35em; border-radius: 3px; }
</style>
</head>
<body>
<h1>भजन typo report</h1>
<p class="summary">${results.length} bhajan(s), ${total} issue(s). Fix: <code>npm run lint:typos -- --fix</code> or edit in admin.</p>
${cards || '<p>No issues found.</p>'}
</body>
</html>`;
}

module.exports = {
  RULES,
  scanAll,
  applyAutoFixes,
  renderMarkdownReport,
  renderHtmlReport,
};
