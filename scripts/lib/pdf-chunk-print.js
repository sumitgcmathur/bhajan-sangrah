const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('./pdf-assets');
const { PDF_PAGE_OPTS, PDF_RENDER_TIMEOUT_MS } = require('./pdf-page-spec');

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

function loadPuppeteer() {
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

async function launchPrintBrowser() {
  const puppeteer = loadPuppeteer();
  if (!puppeteer) {
    throw new Error('Run npm install (needs puppeteer or puppeteer-core).');
  }

  const chrome = findChrome();
  const launchOpts = {
    headless: true,
    args: chromiumLaunchArgs(),
    protocolTimeout: PDF_RENDER_TIMEOUT_MS,
  };
  if (chrome && !process.env.CI) {
    try {
      require.resolve('puppeteer');
    } catch {
      launchOpts.executablePath = chrome;
    }
  }

  return puppeteer.launch(launchOpts);
}

async function printHtmlToPdf(browser, htmlPath, pdfPath, label = '') {
  const fileUrl = pathToFileURL(htmlPath);
  const page = await browser.newPage();
  page.setDefaultTimeout(PDF_RENDER_TIMEOUT_MS);
  try {
    await page.goto(fileUrl, { waitUntil: 'load', timeout: PDF_RENDER_TIMEOUT_MS });
    await page.evaluateHandle(() => document.fonts.ready);
    await page.emulateMediaType('print');
    fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
    await page.pdf({
      path: pdfPath,
      ...PDF_PAGE_OPTS,
      timeout: PDF_RENDER_TIMEOUT_MS,
    });
    const mb = (fs.statSync(pdfPath).size / (1024 * 1024)).toFixed(2);
    console.log(`  ${label || path.basename(pdfPath)} (${mb} MB)`);
  } finally {
    await page.close();
  }
}

async function printChunkBatch(browser, jobs) {
  for (const { htmlPath, pdfPath, label } of jobs) {
    await printHtmlToPdf(browser, htmlPath, pdfPath, label);
  }
}

module.exports = {
  launchPrintBrowser,
  printChunkBatch,
  printHtmlToPdf,
};
