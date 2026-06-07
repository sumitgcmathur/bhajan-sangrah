/**
 * PDF print options for Puppeteer export (see scripts/export-pdf.js).
 */

const PDF_MARGINS = { top: '28mm', bottom: '24mm', left: '18mm', right: '18mm' };

const PDF_PAGE_OPTS = {
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
  margin: PDF_MARGINS,
  displayHeaderFooter: false,
};

module.exports = {
  PDF_MARGINS,
  PDF_PAGE_OPTS,
};
