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
function fillIndexPageNumbersCalibrated(pdfPageCount) {
  var maxY = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
  if (!pdfPageCount || pdfPageCount < 1 || maxY < 1) return {};
  var lo = 50;
  var hi = maxY;
  while (lo < hi - 1) {
    var mid = Math.floor((lo + hi) / 2);
    var n = buildPageRanges(mid).length;
    if (n > pdfPageCount) lo = mid;
    else hi = mid;
  }
  var pageHeight = hi;
  var ranges = buildPageRanges(pageHeight);
  var map = {};
  document.querySelectorAll('.pdf-index__pagenum').forEach(function (span) {
    var id = span.getAttribute('data-target');
    var el = id ? document.getElementById(id) : null;
    if (!el) return;
    var top = el.getBoundingClientRect().top + window.scrollY;
    map[id] = pageNumberAtY(top, ranges);
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

function normalizeId(id) {
  return id.normalize('NFC');
}

function destNameKeys(id) {
  const n = normalizeId(id);
  const keys = [n];
  try {
    keys.push(encodeURIComponent(n));
  } catch {
    /* ignore */
  }
  return keys;
}

async function destRefToPage(doc, destRef) {
  if (!destRef) return null;
  try {
    return (await doc.getPageIndex(destRef)) + 1;
  } catch {
    return null;
  }
}

function mapsEqual(a, b, ids) {
  return ids.every((id) => a[id] === b[id] && a[id] != null);
}

function hashFromAnnotUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const idx = url.lastIndexOf('#');
  if (idx === -1) return '';
  return normalizeId(decodeDestName(url.slice(idx + 1)));
}

async function resolveAnnotDestPage(doc, annot) {
  if (annot.dest) {
    if (typeof annot.dest === 'string') {
      try {
        const named = await doc.getDestination(annot.dest);
        const page = await destRefToPage(doc, named);
        if (page) return page;
      } catch {
        /* try as ref below */
      }
    }
    const page = await destRefToPage(doc, annot.dest);
    if (page) return page;
  }
  return null;
}

/** Resolve named destinations + link targets from a draft PDF (Chromium pagination). */
async function mapIdsToPagesFromPdfBuffer(pdfBuffer, ids) {
  const pdfjsLib = loadPdfJs();
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
  const map = {};
  const normalizedIds = ids.map(normalizeId);
  const idSet = new Set(normalizedIds);

  await mapIdsFromLinkDestinations(doc, normalizedIds, map);

  let catalogDests = {};
  try {
    catalogDests = await doc.getDestinations();
  } catch {
    /* no named dests */
  }

  for (const [rawName, destRef] of Object.entries(catalogDests)) {
    const decoded = normalizeId(decodeDestName(rawName));
    if (!idSet.has(decoded) || map[decoded]) continue;
    const page = await destRefToPage(doc, destRef);
    if (page) map[decoded] = page;
  }

  for (const id of normalizedIds) {
    if (map[id]) continue;
    for (const key of destNameKeys(id)) {
      try {
        const dest = await doc.getDestination(key);
        const page = await destRefToPage(doc, dest);
        if (page) {
          map[id] = page;
          break;
        }
      } catch {
        /* try next key variant */
      }
    }
  }

  const resolved = normalizedIds.filter((id) => map[id] != null).length;
  if (resolved < ids.length) {
    console.warn(`pdf.js resolved ${resolved}/${ids.length} destination pages`);
  } else {
    console.log(`pdf.js resolved ${resolved}/${ids.length} destination pages`);
  }

  const numPages = doc.numPages;
  await doc.destroy();
  return { map, numPages };
}

/**
 * Resolve link targets via annotation.dest (target page), NOT the page where the
 * index link is drawn (that caused TOC pages ~18 for content on page 110).
 */
async function mapIdsFromLinkDestinations(doc, ids, map) {
  const wanted = new Set(ids.filter((id) => !map[id]));
  if (wanted.size === 0) return;

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const annots = await page.getAnnotations();
    for (const annot of annots) {
      if (annot.subtype !== 'Link') continue;

      const hash = hashFromAnnotUrl(annot.unsafeUrl || annot.url || '');
      if (!hash || !wanted.has(hash) || map[hash]) continue;

      let pageNo = await resolveAnnotDestPage(doc, annot);
      if (!pageNo) {
        for (const key of destNameKeys(hash)) {
          try {
            const dest = await doc.getDestination(key);
            pageNo = await destRefToPage(doc, dest);
            if (pageNo) break;
          } catch {
            /* try next */
          }
        }
      }
      if (!pageNo) continue;

      map[hash] = pageNo;
      wanted.delete(hash);
      if (wanted.size === 0) return;
    }
  }
}

async function mergeLayoutPageMap(page, pdfPageCount, ids, map, normIds) {
  const layoutMap = await page.evaluate(
    (helperSrc, numPages) => {
      // eslint-disable-next-line no-eval
      eval(helperSrc);
      return fillIndexPageNumbersCalibrated(numPages);
    },
    HELPER_SRC,
    pdfPageCount
  );

  let filled = 0;
  for (const id of ids) {
    const n = normalizeId(id);
    if (map[n] == null && layoutMap[id] != null) {
      map[n] = layoutMap[id];
      filled += 1;
    }
  }
  if (filled > 0) {
    console.log(
      `Layout calibration filled ${filled} entries using ${pdfPageCount} PDF pages`
    );
  }
}

function mapForDom(map, ids) {
  const out = {};
  for (const id of ids) {
    const n = normalizeId(id);
    if (map[n] != null) out[id] = map[n];
    else if (map[id] != null) out[id] = map[id];
  }
  return out;
}

async function applyPageMap(page, map, ids) {
  const domMap = mapForDom(map, ids);
  await page.evaluate((pageMap) => {
    document.querySelectorAll('.pdf-index__pagenum').forEach((span) => {
      const id = span.getAttribute('data-target');
      if (!id) return;
      const num = pageMap[id];
      if (num != null) span.textContent = String(num);
    });
  }, domMap);
}

/**
 * Iterative draft PDFs until index page numbers stabilize.
 * Index uses "000" placeholders so the first draft matches final pagination.
 */
async function fillIndexPageNumbers(page) {
  const ids = await page.evaluate(() =>
    [...document.querySelectorAll('.pdf-index__pagenum')]
      .map((s) => s.getAttribute('data-target'))
      .filter(Boolean)
  );
  const normIds = ids.map(normalizeId);

  let prevMap = null;
  let stableStreak = 0;

  for (let pass = 1; pass <= 8; pass++) {
    const draftBuffer = await page.pdf({ ...PDF_PAGE_OPTS });
    const { map: pdfMap, numPages } = await mapIdsToPagesFromPdfBuffer(Buffer.from(draftBuffer), ids);
    const newMap = { ...pdfMap };

    const missing = normIds.filter((id) => newMap[id] == null);
    if (missing.length > 0) {
      await mergeLayoutPageMap(page, numPages, ids, newMap, normIds);
    }

    const stillMissing = normIds.filter((id) => newMap[id] == null);
    if (stillMissing.length > 0) {
      throw new Error(
        `Could not resolve ${stillMissing.length}/${ids.length} index pages (pass ${pass}). ` +
          `First missing: ${stillMissing[0]}`
      );
    }

    await applyPageMap(page, newMap, ids);

    if (prevMap && mapsEqual(prevMap, newMap, normIds)) {
      stableStreak += 1;
    } else {
      stableStreak = 0;
    }

    if (stableStreak >= 2) {
      const finalBuffer = await page.pdf({ ...PDF_PAGE_OPTS });
      const { map: finalPdfMap, numPages } = await mapIdsToPagesFromPdfBuffer(
        Buffer.from(finalBuffer),
        ids
      );
      const finalMap = { ...finalPdfMap };
      const finalMissing = normIds.filter((id) => finalMap[id] == null);
      if (finalMissing.length > 0) {
        await mergeLayoutPageMap(page, numPages, ids, finalMap, normIds);
      }
      await applyPageMap(page, finalMap, ids);

      const lastId = normIds[normIds.length - 1];
      console.log(
        `Index page numbers: ${ids.length}/${ids.length} stable after ${pass} pass(es); ` +
          `last entry → page ${finalMap[lastId]}`
      );
      return finalMap;
    }

    prevMap = { ...newMap };
  }

  throw new Error(
    `Index page numbers did not stabilize in 8 passes (last entry page ${prevMap?.[normIds[normIds.length - 1]]})`
  );
}

module.exports = {
  PDF_MARGINS,
  PDF_PAGE_CONTENT_HEIGHT,
  PDF_PAGE_OPTS,
  FILL_INDEX_PAGE_NUMBERS_JS,
  fillIndexPageNumbers,
};
