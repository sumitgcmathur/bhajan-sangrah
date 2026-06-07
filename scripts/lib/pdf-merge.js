const fs = require('fs');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
/** Bottom-center page labels (chunk PDFs have no CSS footer). */
async function stampPageNumbers(pdfDoc) {
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const total = pdfDoc.getPageCount();
  const color = rgb(0.36, 0.29, 0.26);
  const size = 9;
  const bottomMm = 10;

  for (let i = 0; i < total; i++) {
    const page = pdfDoc.getPage(i);
    const { width } = page.getSize();
    const text = `${i + 1} / ${total}`;
    const textWidth = font.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: (width - textWidth) / 2,
      y: (bottomMm / 25.4) * 72,
      size,
      font,
      color,
    });
  }
}

async function mergePdfChunks(chunkPdfPaths, outPath) {
  const merged = await PDFDocument.create();

  for (const chunkPath of chunkPdfPaths) {
    if (!fs.existsSync(chunkPath)) {
      throw new Error(`Missing chunk PDF: ${chunkPath}`);
    }
    const bytes = fs.readFileSync(chunkPath);
    const doc = await PDFDocument.load(bytes);
    const indices = doc.getPageIndices();
    const pages = await merged.copyPages(doc, indices);
    for (const page of pages) {
      merged.addPage(page);
    }
  }

  await stampPageNumbers(merged);
  const pageCount = merged.getPageCount();
  fs.mkdirSync(require('path').dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, await merged.save());
  const mb = (fs.statSync(outPath).size / (1024 * 1024)).toFixed(1);
  console.log(`Merged PDF: ${outPath} (${pageCount} pages, ${mb} MB)`);
}

module.exports = {
  mergePdfChunks,
  stampPageNumbers,
};
