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
const { createEmbeddedAssetResolver } = require('./lib/pdf-assets');
const { PDF_PAGE_OPTS } = require('./lib/pdf-print');

const OUT_DIR = path.join(ROOT, 'output');
const DEFAULT_HTML = path.join(OUT_DIR, 'pdf-export.html');
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

async function writePdf(page, htmlPath, pdfPath) {
  await page.emulateMediaType('print');
  fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
  await page.pdf({ path: pdfPath, ...PDF_PAGE_OPTS });
  console.log(`PDF written: ${pdfPath}`);
}

async function exportPdfWithPuppeteer(htmlPath, pdfPath) {
  const puppeteer = require('puppeteer');
  const fileUrl = pathToFileURL(htmlPath);

  const browser = await puppeteer.launch({
    headless: true,
    args: chromiumLaunchArgs(),
  });

  try {
    const page = await browser.newPage();
    await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 120000 });
    await page.evaluateHandle(() => document.fonts.ready);
    await writePdf(page, htmlPath, pdfPath);
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
  });

  try {
    const page = await browser.newPage();
    await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 120000 });
    await page.evaluateHandle(() => document.fonts.ready);
    await writePdf(page, htmlPath, pdfPath);
  } finally {
    await browser.close();
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
  await execFileAsync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--allow-file-access-from-files',
      '--virtual-time-budget=45000',
      '--print-background',
      '--no-pdf-header-footer',
      ...chromiumLaunchArgs(),
      `--print-to-pdf=${pdfAbs}`,
      fileUrl,
    ],
    { timeout: 600000 }
  );
  if (!fs.existsSync(pdfAbs)) throw new Error('Chrome did not produce a PDF file.');
  console.log(`PDF written: ${pdfAbs} (via Chrome CLI)`);
}

async function exportPdf(htmlPath, pdfPath) {
  const errors = [];

  try {
    require.resolve('puppeteer');
    try {
      await exportPdfWithPuppeteer(htmlPath, pdfPath);
      return;
    } catch (e) {
      errors.push(`Puppeteer: ${e.message}`);
    }
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') throw e;
    errors.push('Puppeteer: package not installed');
  }

  try {
    await exportPdfWithSystemChrome(htmlPath, pdfPath);
    return;
  } catch (e) {
    errors.push(`Chrome + puppeteer-core: ${e.message}`);
  }

  try {
    await exportPdfWithChromeCli(htmlPath, pdfPath);
    return;
  } catch (e) {
    errors.push(`Chrome CLI: ${e.message}`);
  }

  throw new Error(`PDF export failed:\n${errors.map((x) => `  - ${x}`).join('\n')}`);
}

async function main() {
  const { pdfPath } = parseArgs();
  const config = loadSections();
  const payloads = loadAllSectionPayloads(config);

  const html = renderPdfDocument(config, payloads, {
    resolveAsset: createEmbeddedAssetResolver(),
  });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(DEFAULT_HTML, html, 'utf8');
  console.log(`HTML preview: ${DEFAULT_HTML}`);

  const total = payloads.reduce((n, p) => n + p.bhajans.length, 0);
  console.log(`Exporting ${payloads.length} sections, ${total} bhajans…`);

  await exportPdf(DEFAULT_HTML, pdfPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
