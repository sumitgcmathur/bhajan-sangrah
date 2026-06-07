#!/usr/bin/env node
/**
 * Export full site content to a single PDF (भजन सूची without page numbers).
 * Usage: node scripts/export-pdf.js [--out path/to/file.pdf]
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const { ROOT } = require('./lib/paths');
const { loadSections } = require('./lib/sections');
const { renderPdfDocument, pathToFileURL } = require('./lib/pdf-template');
const { loadAllSectionPayloads } = require('./lib/pdf-payloads');
const { createPdfAssetResolver } = require('./lib/pdf-assets');
const { PDF_PAGE_OPTS } = require('./lib/pdf-print');

const OUT_DIR = path.join(ROOT, 'output');
const DEFAULT_HTML = path.join(OUT_DIR, 'pdf-export.html');
const DEFAULT_PDF = path.join(OUT_DIR, 'bhajan-sangrah.pdf');
/** Puppeteer default is 30s — large exports need much longer (especially in CI). */
const PDF_RENDER_TIMEOUT_MS = Number(process.env.PDF_RENDER_TIMEOUT_MS) || (process.env.CI ? 600_000 : 180_000);

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

function chromiumLaunchArgs() {
  const args = ['--font-render-hinting=none'];
  if (process.env.CI || process.platform === 'linux') {
    args.push('--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage');
  }
  return args;
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function writePdf(page, pdfPath) {
  await page.emulateMediaType('print');
  fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
  await page.pdf({
    path: pdfPath,
    ...PDF_PAGE_OPTS,
    timeout: PDF_RENDER_TIMEOUT_MS,
  });
  const mb = (fs.statSync(pdfPath).size / (1024 * 1024)).toFixed(1);
  console.log(`PDF written: ${pdfPath} (${mb} MB)`);
}

async function exportPdfWithPuppeteer(htmlPath, pdfPath) {
  const puppeteer = require('puppeteer');
  const fileUrl = pathToFileURL(htmlPath);

  const browser = await puppeteer.launch({
    headless: true,
    args: chromiumLaunchArgs(),
    protocolTimeout: PDF_RENDER_TIMEOUT_MS,
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(PDF_RENDER_TIMEOUT_MS);
    await page.goto(fileUrl, { waitUntil: 'load', timeout: PDF_RENDER_TIMEOUT_MS });
    await page.evaluateHandle(() => document.fonts.ready);
    console.log('Rendering PDF with Puppeteer…');
    await writePdf(page, pdfPath);
  } finally {
    await browser.close();
  }
}

function loadPuppeteerModule() {
  try {
    return require('puppeteer');
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') throw e;
  }
  try {
    return require('puppeteer-core');
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') throw e;
    return null;
  }
}

async function exportPdfWithSystemChrome(htmlPath, pdfPath) {
  const puppeteer = loadPuppeteerModule();
  if (!puppeteer) {
    throw new Error('Run npm install (needs puppeteer-core for PDF export).');
  }
  const chrome = findChrome();
  if (!chrome) {
    throw new Error('Chrome/Edge not found. Install Google Chrome or set CHROME_PATH.');
  }

  const fileUrl = pathToFileURL(htmlPath);
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: chromiumLaunchArgs(),
    protocolTimeout: PDF_RENDER_TIMEOUT_MS,
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(PDF_RENDER_TIMEOUT_MS);
    await page.goto(fileUrl, { waitUntil: 'load', timeout: PDF_RENDER_TIMEOUT_MS });
    await page.evaluateHandle(() => document.fonts.ready);
    console.log('Rendering PDF with system Chrome…');
    await writePdf(page, pdfPath);
  } finally {
    await browser.close();
  }
}

function pdfLooksReady(pdfAbs) {
  try {
    return fs.statSync(pdfAbs).size > 1024;
  } catch {
    return false;
  }
}

async function exportPdfWithChromeCli(htmlPath, pdfPath) {
  const chrome = findChrome();
  if (!chrome) {
    throw new Error('Chrome/Edge not found. Install Google Chrome or set CHROME_PATH.');
  }
  fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
  const fileUrl = pathToFileURL(htmlPath);
  const pdfAbs = path.resolve(pdfPath);
  const chromeArgs = [
    '--headless=new',
    '--disable-gpu',
    '--allow-file-access-from-files',
    '--print-background',
    '--no-pdf-header-footer',
    ...chromiumLaunchArgs(),
    `--print-to-pdf=${pdfAbs}`,
    fileUrl,
  ];
  // virtual-time-budget exits before large PDFs finish; use only on Windows hang workaround.
  if (process.platform === 'win32') {
    chromeArgs.splice(3, 0, '--virtual-time-budget=180000');
  }
  try {
    console.log('Rendering PDF with Chrome CLI…');
    await execFileAsync(chrome, chromeArgs, {
      timeout: PDF_RENDER_TIMEOUT_MS,
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch (err) {
    // Headless Chrome often prints the PDF then hangs or exits non-zero on Windows.
    if (!pdfLooksReady(pdfAbs)) throw err;
    console.warn('Chrome CLI exited with warnings; PDF file is present.');
  }
  if (!pdfLooksReady(pdfAbs)) throw new Error('Chrome did not produce a PDF file.');
  const mb = (fs.statSync(pdfAbs).size / (1024 * 1024)).toFixed(1);
  console.log(`PDF written: ${pdfAbs} (${mb} MB, via Chrome CLI)`);
}

async function exportPdf(htmlPath, pdfPath) {
  const errors = [];
  const attempts = process.env.CI
    ? [
        ['Puppeteer', exportPdfWithPuppeteer],
        ['Chrome CLI', exportPdfWithChromeCli],
        ['Chrome + puppeteer-core', exportPdfWithSystemChrome],
      ]
    : [
        ['Puppeteer', exportPdfWithPuppeteer],
        ['Chrome + puppeteer-core', exportPdfWithSystemChrome],
        ['Chrome CLI', exportPdfWithChromeCli],
      ];

  for (const [label, fn] of attempts) {
    try {
      if (label === 'Puppeteer') require.resolve('puppeteer');
      await fn(htmlPath, pdfPath);
      return;
    } catch (e) {
      if (e.code === 'MODULE_NOT_FOUND' && label === 'Puppeteer') {
        errors.push(`${label}: package not installed`);
      } else {
        errors.push(`${label}: ${e.message}`);
      }
    }
  }

  throw new Error(`PDF export failed:\n${errors.map((x) => `  - ${x}`).join('\n')}`);
}

async function main() {
  const { pdfPath } = parseArgs();
  const config = loadSections();
  const payloads = loadAllSectionPayloads(config);

  const resolveAsset = await createPdfAssetResolver(config, payloads);

  const html = renderPdfDocument(config, payloads, {
    resolveAsset,
  });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(DEFAULT_HTML, html, 'utf8');
  console.log(`HTML preview: ${DEFAULT_HTML}`);

  const total = payloads.reduce((n, p) => n + p.bhajans.length, 0);
  console.log(`Exporting ${payloads.length} sections, ${total} bhajans…`);

  const t0 = Date.now();
  await exportPdf(DEFAULT_HTML, pdfPath);
  console.log(`PDF export finished in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
