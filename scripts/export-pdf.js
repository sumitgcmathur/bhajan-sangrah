#!/usr/bin/env node
/**
 * Chunked PDF export: front matter + one PDF per section → merge (pdf-lib).
 * Usage: node scripts/export-pdf.js [--out path/to/file.pdf]
 */
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./lib/paths');
const { loadSections } = require('./lib/sections');
const { loadAllSectionPayloads } = require('./lib/pdf-payloads');
const { createPdfAssetResolver } = require('./lib/pdf-assets');
const { buildPdfWatermarks } = require('./lib/pdf-watermark');
const { renderFrontMatterChunk, renderSectionChunk } = require('./lib/pdf-chunk-render');
const { launchPrintBrowser, printChunkBatch } = require('./lib/pdf-chunk-print');
const { mergePdfChunks } = require('./lib/pdf-merge');

const OUT_DIR = path.join(ROOT, 'output');
const CHUNKS_DIR = path.join(OUT_DIR, 'pdf-chunks');
const DEFAULT_PDF = path.join(OUT_DIR, 'bhajan-sangrah.pdf');

function parseArgs() {
  const args = process.argv.slice(2);
  let out = DEFAULT_PDF;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' && args[i + 1]) {
      out = path.resolve(args[i + 1]);
      i += 1;
    }
  }
  return { pdfPath: out };
}

function writeChunkHtml(name, html) {
  const htmlPath = path.join(CHUNKS_DIR, `${name}.html`);
  fs.mkdirSync(CHUNKS_DIR, { recursive: true });
  fs.writeFileSync(htmlPath, html, 'utf8');
  return htmlPath;
}

async function main() {
  const { pdfPath } = parseArgs();
  const config = loadSections();
  const { sectionPayloads, uniqueCount } = loadAllSectionPayloads(config);

  const resolveAsset = await createPdfAssetResolver(config, sectionPayloads);
  const watermarkBySlug = await buildPdfWatermarks(sectionPayloads);

  const listed = sectionPayloads.reduce((n, p) => n + p.bhajans.length, 0);
  console.log(`Exporting ${sectionPayloads.length} sections, ${uniqueCount} bhajans (${listed} listings)…`);

  const jobs = [];
  const chunkPdfPaths = [];

  const frontHtml = renderFrontMatterChunk(config, sectionPayloads, resolveAsset, {
    uniqueCount,
  });
  const frontHtmlPath = writeChunkHtml('00-front', frontHtml);
  const frontPdfPath = path.join(CHUNKS_DIR, '00-front.pdf');
  jobs.push({ htmlPath: frontHtmlPath, pdfPath: frontPdfPath, label: 'front matter' });
  chunkPdfPaths.push(frontPdfPath);

  sectionPayloads.forEach(({ section, bhajans }, i) => {
    const slug = section.slug || `section-${i}`;
    const name = `${String(i + 1).padStart(2, '0')}-${slug}`;
    const html = renderSectionChunk(section, bhajans, resolveAsset, watermarkBySlug);
    const htmlPath = writeChunkHtml(name, html);
    const pdfPathChunk = path.join(CHUNKS_DIR, `${name}.pdf`);
    jobs.push({ htmlPath, pdfPath: pdfPathChunk, label: section.title });
    chunkPdfPaths.push(pdfPathChunk);
  });

  const t0 = Date.now();
  const browser = await launchPrintBrowser();
  try {
    console.log(`Printing ${jobs.length} chunks…`);
    await printChunkBatch(browser, jobs);
  } finally {
    await browser.close();
  }

  console.log('Merging chunks…');
  await mergePdfChunks(chunkPdfPaths, pdfPath);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`PDF export finished in ${elapsed}s → ${pdfPath}`);
  console.log(`Chunk artifacts: ${CHUNKS_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
