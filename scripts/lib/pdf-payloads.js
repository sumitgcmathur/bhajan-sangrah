const path = require('path');
const { sectionFolder, listBhajanFiles, loadBhajan } = require('./sections');

/** Short id for PDF named destinations (PDF spec limits name length; Hindi slugs are too long). */
function pdfBhajanId(index) {
  return `b${String(index + 1).padStart(3, '0')}`;
}

/** All sections + bhajans for PDF export. */
function loadAllSectionPayloads(config) {
  const sections = config.sections || [];
  let globalIndex = 0;
  return sections.map((section) => {
    const files = listBhajanFiles(section);
    const bhajans = files.map((f) => {
      const data = loadBhajan(path.join(sectionFolder(section), f));
      const id = pdfBhajanId(globalIndex);
      globalIndex += 1;
      return {
        title: data.title,
        tarz: data.tarz,
        group: data.group,
        swarachit: data.swarachit,
        lyrics: data.lyrics,
        dhvani: data.dhvani,
        jabani: data.jabani,
        id,
      };
    });
    return { section, bhajans };
  });
}

module.exports = { loadAllSectionPayloads, pdfBhajanId };
