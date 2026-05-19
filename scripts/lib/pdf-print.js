/**
 * PDF print layout + index page numbers via two-pass PDF (pdf.js reads real destinations).
 */

const PDF_MARGINS = { top: '16mm', bottom: '24mm', left: '14mm', right: '14mm' };
const PDF_PAGE_CONTENT_HEIGHT = 'calc(297mm - 16mm - 24mm)';

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
  var probe = document.createElement('motion');
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
`.replace(/createElement\('motion'\)/g, "createElement('div')");
}

const HELPER_SRC = paginationHelperSource(PDF_PAGE_CONTENT_HEIGHT);

const FILL_INDEX_PAGE_NUMBERS_JS = `(function () {
${HELPER_SRC}
  function schedule() {
    fillIndexPageNumbersSimulator();
    setTimeout(fillIndexPageNumbersSimulator, 200);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  else schedule();
})();`;

function loadPdfJs() {
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  try {
    const worker = require('pdfjs-dist/legacy/build/pdf.worker.js');
    pdfjsLib.GlobalWorkerOptions.workerSrc = worker;
  } catch {
    /* optional worker */
  }
  return pdfjsLib;
}

/** Read named destinations from a draft PDF (matches Chromium pagination). */
async function mapIdsToPagesFromPdfBuffer(pdfBuffer, ids) {
  const pdfjsLib = loadPdfJs();
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
  const map = {};

  for (const id of ids) {
    try {
      const dest = await doc.getDestination(id);
      if (!dest) continue;
      const pageIndex = await doc.getPageIndex(dest);
      map[id] = pageIndex + 1;
    } catch {
      /* unknown destination */
    }
  }

  await doc.destroy();
  return map;
}

async function applyPageMap(page, map) {
  await page.evaluate((pageMap) => {
    document.querySelectorAll('.pdf-index__pagenum').forEach((span) => {
      const id = span.getAttribute('data-target');
      if (id && pageMap[id]) span.textContent = String(pageMap[id]);
    });
  }, map);
}

async function fillIndexPageNumbers(page) {
  const ids = await page.evaluate(() =>
    [...document.querySelectorAll('.pdf-index__pagenum')]
      .map((s) => s.getAttribute('data-target'))
      .filter(Boolean)
  );

  const draftBuffer = await page.pdf({ ...PDF_PAGE_OPTS });
  let map = await mapIdsToPagesFromPdfBuffer(Buffer.from(draftBuffer), ids);

  const missing = ids.filter((id) => !map[id]);
  if (missing.length > 0) {
    console.warn(`pdf.js missing ${missing.length}/${ids.length} destinations — layout fallback`);
    const simMap = await page.evaluate((helperSrc) => {
      // eslint-disable-next-line no-eval
      eval(helperSrc);
      return fillIndexPageNumbersSimulator();
    }, HELPER_SRC);
    for (const id of missing) {
      if (simMap[id]) map[id] = simMap[id];
    }
  }

  console.log(`Index page numbers: ${Object.keys(map).length}/${ids.length} from PDF destinations`);
  await applyPageMap(page, map);
  return map;
}

module.exports = {
  PDF_MARGINS,
  PDF_PAGE_CONTENT_HEIGHT,
  PDF_PAGE_OPTS,
  FILL_INDEX_PAGE_NUMBERS_JS,
  fillIndexPageNumbers,
};
