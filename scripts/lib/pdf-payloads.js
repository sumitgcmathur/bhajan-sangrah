const path = require('path');
const { sectionFolder, listBhajanFiles, loadBhajan } = require('./sections');
const { anchorId } = require('./template');

/** All sections + bhajans for PDF / print.html. */
function loadAllSectionPayloads(config) {
  const sections = config.sections || [];
  return sections.map((section) => {
    const files = listBhajanFiles(section);
    const bhajans = files.map((f, i) => {
      const data = loadBhajan(path.join(sectionFolder(section), f));
      return {
        title: data.title,
        tarz: data.tarz,
        group: data.group,
        swarachit: data.swarachit,
        lyrics: data.lyrics,
        dhvani: data.dhvani,
        jabani: data.jabani,
        id: data.id || anchorId(section.slug, data.title, i),
      };
    });
    return { section, bhajans };
  });
}

module.exports = { loadAllSectionPayloads };
