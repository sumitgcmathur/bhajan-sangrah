const { renderBhajanCard } = require('../../scripts/lib/template');
const { editorToDoc } = require('./yaml-bridge');

/** HTML for one bhajan card — same output as the public section page. */
function renderBhajanPreviewCard(editor, section) {
  const doc = editorToDoc(editor);
  const bhajan = {
    title: doc.title || 'Untitled',
    tarz: doc.tarz,
    swarachit: doc.swarachit,
    jabani: doc.jabani,
    lyrics: doc.lyrics,
    group: doc.group,
  };
  const slug = section?.slug || 'preview';
  const showSwarachitBadge = slug !== 'swarachit';
  return renderBhajanCard(bhajan, { slug, title: section?.title || slug }, 0, showSwarachitBadge);
}

module.exports = { renderBhajanPreviewCard };
