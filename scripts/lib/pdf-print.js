/**
 * PDF print layout + index page numbers.
 * - Browser print: CSS target-counter (resolved by the print engine).
 * - Puppeteer export: iterative draft PDF + pdf.js named destinations.
 */

const PDF_MARGINS = { top: '16mm', bottom: '24mm', left: '14mm', right: '14mm' };
/** Must match --pdf-page-body-height in pdf-export.css */
const PDF_PAGE_CONTENT_HEIGHT = '255mm';

const PDF_PAGE_OPTS = {
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
  margin: PDF_MARGINS,
  displayHeaderFooter: false,
};

function paginationHelperSource(pageContentHeight) {
  return `
function measurePrintPageHeight() {
  var probe = document.createElement('d' + 'iv');
  probe.style.cssText = 'position:absolute;visibility:hidden;height:${pageContentHeight};width:1px;';
  document.body.appendChild(probe);
  var h = probe.offsetHeight;
  probe.remove();
  return h;
}
function isPageBreak(v) { return v === 'page' || v === 'always' || v === 'left' || v === 'right'; }
function collectForcedPageStarts() {
  var starts = [0];
  document.querySelectorAll('body *').forEach(function (el) {
    var s = window.getComputedStyle(el);
    if (isPageBreak(s.breakBefore) || isPageBreak(s.pageBreakBefore)) starts.push(el.offsetTop);
    if (isPageBreak(s.breakAfter) || isPageBreak(s.pageBreakAfter)) starts.push(el.offsetTop + el.offsetHeight);
  });
  starts.sort(function (a, b) { return a - b; });
  var out = [], last = -1;
  starts.forEach(function (y) {
    y = Math.round(y);
    if (y > last) { out.push(y); last = y; }
  });
  return out;
}
function buildPageRanges(pageHeight) {
  var forced = collectForcedPageStarts();
  var maxY = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
  var ranges = [], page = 1, startY = 0;
  while (startY < maxY - 1) {
    var limit = startY + pageHeight;
    var nextForced = null;
    for (var k = 0; k < forced.length; k++) {
      var fy = forced[k];
      if (fy > startY && fy < limit) { nextForced = fy; break; }
    }
    var endY = nextForced !== null ? nextForced : limit;
    if (endY <= startY) endY = limit;
    ranges.push({ start: startY, end: endY, page: page });
    startY = endY;
    page += 1;
    if (page > 600) break;
  }
  return ranges;
}
function pageNumberAtY(targetY, ranges) {
  var y = Math.round(targetY);
  for (var i = 0; i < ranges.length; i++) {
    var r = ranges[i];
    if (y >= r.start && y < r.end) return r.page;
  }
  return ranges.length ? ranges[ranges.length - 1].page : 1;
}
function fillIndexPageNumbersSimulator() {
  var pageHeight = measurePrintPageHeight();
  if (!pageHeight) return {};
  var ranges = buildPageRanges(pageHeight);
  var map = {};
  document.querySelectorAll('.pdf-index__pagenum').forEach(function (span) {
    var id = span.getAttribute('data-target');
    var el = id ? document.getElementById(id) : null;
    if (!el) return;
    var top = el.getBoundingClientRect().top + window.scrollY;
    map[id] = pageNumberAtY(top, ranges);
    span.textContent = String(map[id]);
  });
  return map;
}
`;
}

const HELPER_SRC = paginationHelperSource(PDF_PAGE_CONTENT_HEIGHT);

/** Screen preview only — print uses CSS target-counter (see pdf-export.css). */
const FILL_INDEX_PAGE_NUMBERS_JS = `(function () {
${HELPER_SRC}
  function isPrintMedia() {
    return window.matchMedia && window.matchMedia('print').matches;
  }
  function screenPreview() {
    if (isPrintMedia()) return;
    fillIndexPageNumbersSimulator();
  }
  function schedule() {
    screenPreview();
    setTimeout(screenPreview, 200);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  else schedule();
  if (window.matchMedia) {
    var mq = window.matchMedia('print');
    if (mq.addEventListener) {
      mq.addEventListener('change', function (e) {
        if (!e.matches) schedule();
      });
    }
  }
})();`;

function loadPdfJs() {
  let pdfjsLib;
  try {
    pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');
  } catch {
    pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  }
  try {
    const worker = require('pdfjs-dist/legacy/build/pdf.worker.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = worker;
  } catch {
    try {
      const worker = require('pdfjs-dist/legacy/build/pdf.worker.js');
      pdfjsLib.GlobalWorkerOptions.workerSrc = worker;
    } catch {
      /* optional worker */
    }
  }
  return pdfjsLib;
}

function decodeDestName(name) {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

function mapsEqual(a, b, ids) {
  return ids.every((id) => a[id] === b[id] && a[id] != null);
}

/** Resolve named destinations from a draft PDF (Chromium pagination). */
async function mapIdsToPagesFromPdfBuffer(pdfBuffer, ids) {
  const pdfjsLib = loadPdfJs();
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
  const map = {};

  let catalogDests = {};
  try {
    catalogDests = await doc.getDestinations();
  } catch {
    /* no named dests */
  }

  const idSet = new Set(ids);
  for (const [rawName, destRef] of Object.entries(catalogDests)) {
    const name = decodeDestName(rawName);
    if (!idSet.has(name) || map[name]) continue;
    try {
      const pageIndex = await doc.getPageIndex(destRef);
      map[name] = pageIndex + 1;
    } catch {
      /* skip */
    }
  }

  for (const id of ids) {
    if (map[id]) continue;
    try {
      const dest = await doc.getDestination(id);
      if (!dest) continue;
      const pageIndex = await doc.getPageIndex(dest);
      map[id] = pageIndex + 1;
    } catch {
      /* unknown destination */
    }
  }

  const missing = ids.filter((id) => !map[id]);
  if (missing.length > 0) {
    await mapIdsFromLinkAnnotations(doc, missing, map);
  }

  await doc.destroy();
  return map;
}

/** Fallback: internal link annotations (#id) on each page. */
async function mapIdsFromLinkAnnotations(doc, ids, map) {
  const wanted = new Set(ids.filter((id) => !map[id]));
  if (wanted.size === 0) return;

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const annots = await page.getAnnotations();
    for (const annot of annots) {
      if (annot.subtype !== 'Link') continue;
      const raw =
        (annot.unsafeUrl && annot.unsafeUrl.startsWith('#') && annot.unsafeUrl.slice(1)) ||
        (annot.url && annot.url.includes('#') && annot.url.slice(annot.url.indexOf('#') + 1)) ||
        '';
      const hash = raw ? decodeDestName(raw) : '';
      if (!hash || !wanted.has(hash) || map[hash]) continue;
      map[hash] = pageNum;
      wanted.delete(hash);
      if (wanted.size === 0) return;
    }
  }
}

async function applyPageMap(page, map) {
  await page.evaluate((pageMap) => {
    document.querySelectorAll('.pdf-index__pagenum').forEach((span) => {
      const id = span.getAttribute('data-target');
      if (id && pageMap[id]) span.textContent = String(pageMap[id]);
    });
  }, map);
}

/**
 * Two-pass (or more) until index digits stop shifting pagination.
 * Filling the TOC changes page breaks; iterate until stable.
 */
async function fillIndexPageNumbers(page) {
  const ids = await page.evaluate(() =>
    [...document.querySelectorAll('.pdf-index__pagenum')]
      .map((s) => s.getAttribute('data-target'))
      .filter(Boolean)
  );

  let map = {};
  let prevMap = null;

  for (let pass = 1; pass <= 5; pass++) {
    const draftBuffer = await page.pdf({ ...PDF_PAGE_OPTS });
    const newMap = await mapIdsToPagesFromPdfBuffer(Buffer.from(draftBuffer), ids);

    const missing = ids.filter((id) => !newMap[id]);
    if (missing.length > 0) {
      console.warn(`pdf.js missing ${missing.length}/${ids.length} destinations (pass ${pass})`);
    }
    const simMap = await page.evaluate((helperSrc) => {
      // eslint-disable-next-line no-eval
      eval(helperSrc);
      return fillIndexPageNumbersSimulator();
    }, HELPER_SRC);
    for (const id of ids) {
      if (!newMap[id] && simMap[id]) newMap[id] = simMap[id];
    }

    await applyPageMap(page, newMap);

    if (prevMap && mapsEqual(prevMap, newMap, ids)) {
      console.log(
        `Index page numbers: ${Object.keys(newMap).length}/${ids.length} stable after ${pass} pass(es)`
      );
      return newMap;
    }

    prevMap = { ...newMap };
    map = newMap;
  }

  console.warn(
    `Index page numbers: ${Object.keys(map).length}/${ids.length} (did not fully stabilize — check output)`
  );
  return map;
}

module.exports = {
  PDF_MARGINS,
  PDF_PAGE_CONTENT_HEIGHT,
  PDF_PAGE_OPTS,
  FILL_INDEX_PAGE_NUMBERS_JS,
  fillIndexPageNumbers,
};
