const path = require('path');
const { sectionFolder, listBhajanFiles, loadBhajan, sortBhajansForDisplay } = require('./sections');
const { prepareBhajanForRender } = require('./bhajan-render');

/** Short id for PDF named destinations (PDF spec limits name length; Hindi slugs are too long). */
function pdfBhajanId(index) {
  return `b${String(index + 1).padStart(3, '0')}`;
}

/** All sections + bhajans for PDF export. */
function loadAllSectionPayloads(config) {
  let globalIndex = 0;
  return (config.sections || []).map((section) => {
    const files = listBhajanFiles(section);
    const loaded = files.map((f) => loadBhajan(path.join(sectionFolder(section), f)));
    const sorted = sortBhajansForDisplay(section, loaded);
    const bhajans = sorted.map((data) => {
      const id = pdfBhajanId(globalIndex);
      globalIndex += 1;
      return prepareBhajanForRender(data, section, config, { index: globalIndex, id });
    });
    return { section, bhajans };
  });
}

module.exports = { loadAllSectionPayloads, pdfBhajanId };
