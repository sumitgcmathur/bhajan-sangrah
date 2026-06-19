const path = require('path');
const { sortBhajansForDisplay } = require('./sections');
const { buildSectionBhajanMap } = require('./cross-section');
const { prepareBhajanForRender } = require('./bhajan-render');

/** Short id for PDF named destinations (PDF spec limits name length; Hindi slugs are too long). */
function pdfBhajanId(index) {
  return `b${String(index + 1).padStart(3, '0')}`;
}

/** All sections + bhajans for PDF export. */
function loadAllSectionPayloads(config) {
  const sections = config.sections || [];
  const { bySlug, uniqueCount } = buildSectionBhajanMap(sections);
  let globalIndex = 0;

  const sectionPayloads = sections.map((section) => {
    const rawBhajans = bySlug.get(section.slug) || [];
    const bhajans = rawBhajans.map((b, i) => {
      const { _file, _filePath, _primarySection, _isCrossListed, ...doc } = b;
      const id = pdfBhajanId(globalIndex);
      globalIndex += 1;
      const prepared = prepareBhajanForRender(doc, section, config, { index: i, id });
      return {
        ...prepared,
        _isCrossListed: Boolean(_isCrossListed),
        _primarySection: _primarySection || section,
      };
    });
    return { section, bhajans };
  });

  return { sectionPayloads, uniqueCount };
}

module.exports = { loadAllSectionPayloads, pdfBhajanId };
