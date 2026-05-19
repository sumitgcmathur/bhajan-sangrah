/**
 * PDF print layout shared by export-pdf.js and pdf-template inline script.
 * Index page numbers must use the same printable height as page.pdf().
 */

const PDF_MARGINS = { top: '16mm', bottom: '24mm', left: '14mm', right: '14mm' };

/** Printable body height — must match @page margins in pdf-export.css (no header/footer templates). */
const PDF_PAGE_CONTENT_HEIGHT = 'calc(297mm - 16mm - 24mm)';

const PDF_PAGE_OPTS = {
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
  margin: PDF_MARGINS,
  displayHeaderFooter: false,
};

/** JS run in browser to fill .pdf-index__pagenum from element positions. */
const FILL_INDEX_PAGE_NUMBERS_JS = `(function () {
  function fillIndexPageNumbers() {
    var probe = document.createElement('div');
    probe.style.cssText =
      'position:absolute;visibility:hidden;height:calc(297mm - 16mm - 24mm);width:1px;';
    document.body.appendChild(probe);
    var pageHeight = probe.offsetHeight;
    probe.remove();
    if (!pageHeight) return;

    document.querySelectorAll('.pdf-index__pagenum').forEach(function (span) {
      var id = span.getAttribute('data-target');
      var el = id ? document.getElementById(id) : null;
      if (!el) return;
      var top = el.getBoundingClientRect().top + window.scrollY;
      var page = Math.max(1, Math.floor(top / pageHeight) + 1);
      span.textContent = String(page);
    });
  }
  function schedule() {
    fillIndexPageNumbers();
    setTimeout(fillIndexPageNumbers, 150);
  }
  function run() {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(schedule);
    } else {
      schedule();
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();`;

async function fillIndexPageNumbers(page) {
  await page.evaluate((pageContentHeight) => {
    const probe = document.createElement('div');
    probe.style.cssText = `position:absolute;visibility:hidden;height:${pageContentHeight};width:1px;`;
    document.body.appendChild(probe);
    const pageHeight = probe.offsetHeight;
    probe.remove();
    if (!pageHeight) return;

    document.querySelectorAll('.pdf-index__pagenum').forEach((span) => {
      const id = span.getAttribute('data-target');
      const el = id ? document.getElementById(id) : null;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const pageNum = Math.max(1, Math.floor(top / pageHeight) + 1);
      span.textContent = String(pageNum);
    });
  }, PDF_PAGE_CONTENT_HEIGHT);
}

module.exports = {
  PDF_MARGINS,
  PDF_PAGE_CONTENT_HEIGHT,
  PDF_PAGE_OPTS,
  FILL_INDEX_PAGE_NUMBERS_JS,
  fillIndexPageNumbers,
};
