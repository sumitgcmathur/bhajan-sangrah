/**
 * Single source of truth for PDF page geometry (CSS + Puppeteer must match).
 */

const PDF_PAGE = {
  widthMm: 210,
  heightMm: 297,
  marginTopMm: 28,
  marginBottomMm: 24,
  marginXMm: 18,
};

function bodyHeightMm() {
  return PDF_PAGE.heightMm - PDF_PAGE.marginTopMm - PDF_PAGE.marginBottomMm;
}

const PDF_MARGINS = {
  top: `${PDF_PAGE.marginTopMm}mm`,
  bottom: `${PDF_PAGE.marginBottomMm}mm`,
  left: `${PDF_PAGE.marginXMm}mm`,
  right: `${PDF_PAGE.marginXMm}mm`,
};

const PDF_PAGE_OPTS = {
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
  margin: PDF_MARGINS,
  displayHeaderFooter: false,
};

/** Puppeteer default is 30s — section chunks are smaller but many. */
const PDF_RENDER_TIMEOUT_MS =
  Number(process.env.PDF_RENDER_TIMEOUT_MS) || (process.env.CI ? 600_000 : 180_000);

module.exports = {
  PDF_PAGE,
  PDF_MARGINS,
  PDF_PAGE_OPTS,
  PDF_RENDER_TIMEOUT_MS,
  bodyHeightMm,
};
