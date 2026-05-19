#!/usr/bin/env node
/**
 * Export full site content to a single PDF with page numbers in indexes.
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

async function fillIndexPageNumbers(page) {
  await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:absolute;visibility:hidden;height:calc(297mm - 16mm - 20mm);width:1px;';
    document.body.appendChild(probe);
    const pageHeight = probe.offsetHeight;
    probe.remove();
    if (!pageHeight) return;

    document.querySelectorAll('.pdf-index__pagenum').forEach((span) => {
      const id = span.getAttribute('data-target');
      const el = id ? document.getElementById(id) : null;
      if (!el) return;
      const page = Math.max(1, Math.floor(el.offsetTop / pageHeight) + 1);
      span.textContent = String(page);
    });
  });
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
    await page.emulateMediaType('print');
    await fillIndexPageNumbers(page);
    fs.writeFileSync(htmlPath, await page.content(), 'utf8');

    fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '16mm', bottom: '20mm', left: '14mm', right: '14mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate:
        '<div style="font-size:9pt;width:100%;text-align:center;color:#4a6278;font-family:Arial,sans-serif">' +
        '<span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });

    console.log(`PDF written: ${pdfPath}`);
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
    await page.emulateMediaType('print');
    await fillIndexPageNumbers(page);
    fs.writeFileSync(htmlPath, await page.content(), 'utf8');

    fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '16mm', bottom: '20mm', left: '14mm', right: '14mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate:
        '<div style="font-size:9pt;width:100%;text-align:center;color:#4a6278;font-family:Arial,sans-serif">' +
        '<span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });
    console.log(`PDF written: ${pdfPath} (via system Chrome + puppeteer-core)`);
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
  console.warn(
    'Warning: index page numbers need puppeteer-core. Run npm install. PDF may lack index numbers.'
  );
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
  console.log(`PDF written: ${pdfAbs} (via Chrome CLI — index numbers may be empty)`);
}

async function exportPdf(htmlPath, pdfPath) {
  let hasPuppeteer = false;
  try {
    require.resolve('puppeteer');
    hasPuppeteer = true;
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') throw e;
  }

  if (hasPuppeteer) {
    try {
      await exportPdfWithPuppeteer(htmlPath, pdfPath);
      return;
    } catch (e) {
      console.warn(`Puppeteer export failed: ${e.message}`);
    }
  }

  try {
    await exportPdfWithSystemChrome(htmlPath, pdfPath);
    return;
  } catch (e) {
    console.warn(`System Chrome export failed: ${e.message}`);
  }

  await exportPdfWithChromeCli(htmlPath, pdfPath);
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
