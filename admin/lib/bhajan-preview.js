const { editorToDoc } = require('./yaml-bridge');
const { renderBhajanCardFromDoc } = require('../../scripts/lib/bhajan-render');

/** Admin preview wrapper around the shared site render pipeline. */
function renderBhajanPreviewCard(editor, section, config = {}, opts = {}) {
  const { html } = renderBhajanCardFromDoc(editorToDoc(editor), section, config, opts);
  return `<div class="preview-in-section"><div class="bhajan-list">${html}</div></div>`;
}

module.exports = { renderBhajanPreviewCard };
