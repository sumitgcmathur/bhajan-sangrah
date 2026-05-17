#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { CONTENT } = require('./lib/paths');
const { loadBhajanDoc } = require('./lib/yaml-io');
const { analyzeBhajanLyrics } = require('./lib/lyrics-structure');

function walkYamlFiles(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walkYamlFiles(p, out);
    else if (name.endsWith('.yaml') || name.endsWith('.yml')) out.push(p);
  }
  return out;
}

function rel(p) {
  return path.relative(path.join(CONTENT, '..'), p).replace(/\\/g, '/');
}

function main() {
  const files = walkYamlFiles(CONTENT).filter((f) => !f.endsWith('sections.yaml'));
  const rows = [];

  for (const fp of files.sort()) {
    const doc = loadBhajanDoc(fs.readFileSync(fp, 'utf8'));
    if (!doc.lyrics || typeof doc.lyrics !== 'string') {
      rows.push({
        file: rel(fp),
        section: path.basename(path.dirname(fp)),
        title: doc.title || '',
        score: 0,
        tier: 'low',
        strategy: 'missing',
        flags: ['no-flat-lyrics'],
        autoFormat: false,
      });
      continue;
    }
    const a = analyzeBhajanLyrics(doc.lyrics, doc.title);
    rows.push({
      file: rel(fp),
      section: path.basename(path.dirname(fp)),
      title: doc.title || '',
      score: a.score,
      tier: a.tier,
      strategy: a.strategy,
      lineCount: a.lineCount,
      blockCount: a.blockCount,
      paragraphCount: a.paragraphCount,
      flags: a.flags,
      reasons: a.reasons,
      autoFormat: a.autoFormat,
      review: a.review,
      manual: a.manual,
      sthayiPreview: a.sthayiPreview,
    });
  }

  const byTier = { high: [], medium: [], low: [] };
  const bySection = {};
  for (const r of rows) {
    byTier[r.tier].push(r);
    if (!bySection[r.section]) bySection[r.section] = { high: 0, medium: 0, low: 0, total: 0 };
    bySection[r.section][r.tier] += 1;
    bySection[r.section].total += 1;
  }

  const autoLikely = rows.filter((r) => r.score >= 70 && r.score < 80 && !r.flags?.length);
  const report = {
    generatedAt: new Date().toISOString(),
    total: rows.length,
    summary: {
      high: byTier.high.length,
      medium: byTier.medium.length,
      low: byTier.low.length,
      autoFormat: rows.filter((r) => r.autoFormat).length,
      autoLikely: autoLikely.length,
      review: rows.filter((r) => r.review).length,
      manual: rows.filter((r) => r.manual).length,
    },
    bySection,
    high: byTier.high.map((r) => ({ file: r.file, score: r.score, strategy: r.strategy, title: r.title })),
    medium: byTier.medium.map((r) => ({
      file: r.file,
      score: r.score,
      strategy: r.strategy,
      flags: r.flags,
      title: r.title,
    })),
    low: byTier.low.map((r) => ({
      file: r.file,
      score: r.score,
      strategy: r.strategy,
      flags: r.flags,
      title: r.title,
    })),
    all: rows,
  };

  const outJson = path.join(CONTENT, 'lyrics-migration-report.json');
  fs.writeFileSync(outJson, JSON.stringify(report, null, 2), 'utf8');

  const md = [];
  md.push('# Lyrics structure migration — confidence report\n');
  md.push(`Generated: ${report.generatedAt}\n`);
  md.push(`Total bhajans: **${report.total}**\n`);
  md.push('| Tier | Count | Action |');
  md.push('|------|------:|--------|');
  md.push(`| **High** (≥80) | ${report.summary.high} | Auto-format with high confidence |`);
  md.push(`| **Likely** (70–79, clean) | ${report.summary.autoLikely} | Auto-format; quick spot-check |`);
  md.push(`| **Medium** (60–79) | ${report.summary.medium} | Auto-format then review (flags may apply) |`);
  md.push(`| **Low** (<60) | ${report.summary.low} | Manual structure likely needed |\n`);
  md.push(
    `**Recommended auto batch:** ${report.summary.autoFormat + report.summary.autoLikely} files (high + likely)\n`
  );
  md.push('## By section\n');
  md.push('| Section | High | Medium | Low | Total |');
  md.push('|---------|-----:|-------:|----:|------:|');
  for (const [sec, c] of Object.entries(bySection).sort((a, b) => a[0].localeCompare(b[0]))) {
    md.push(`| ${sec} | ${c.high} | ${c.medium} | ${c.low} | ${c.total} |`);
  }
  md.push('\n## Low confidence (manual)\n');
  for (const r of byTier.low) {
    md.push(`- **${r.score}** \`${r.file}\` — ${r.title}${r.flags?.length ? ` _(${r.flags.join(', ')})_` : ''}`);
  }
  md.push('\n## Medium confidence (review after auto-format)\n');
  for (const r of byTier.medium) {
    md.push(`- **${r.score}** \`${r.file}\` — ${r.title}${r.flags?.length ? ` _(${r.flags.join(', ')})_` : ''}`);
  }

  const outMd = path.join(CONTENT, 'lyrics-migration-report.md');
  fs.writeFileSync(outMd, md.join('\n'), 'utf8');

  console.log(`Scanned ${rows.length} bhajan files`);
  console.log(`  High (auto-format):   ${report.summary.high}`);
  console.log(`  Likely (quick check): ${report.summary.autoLikely}`);
  console.log(`  Medium (review):      ${report.summary.medium}`);
  console.log(`  Low (manual):         ${report.summary.low}`);
  console.log(
    `  Auto batch total:     ${report.summary.autoFormat + report.summary.autoLikely}`
  );
  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outMd}`);
}

main();
