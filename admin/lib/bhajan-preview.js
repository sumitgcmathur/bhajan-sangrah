const { editorToDoc } = require('./yaml-bridge');
const { renderBhajanCardFromDoc, resolveSection } = require('../../scripts/lib/bhajan-render');
const { sectionWatermarkAttrs, pageUrl } = require('../../scripts/lib/template');

/** Admin preview wrapper around the shared site render pipeline. */
function renderBhajanPreviewCard(editor, section, config = {}, opts = {}) {
  const sectionEntry = resolveSection(section, config);
  const { html } = renderBhajanCardFromDoc(editorToDoc(editor), sectionEntry, config, opts);
  const base = config.base_url || '/';
  const wm = sectionWatermarkAttrs(sectionEntry, base, { preview: true });
  return `<div class="preview-in-section${wm.classSuffix}"${wm.styleAttr}><div class="bhajan-list">${html}</div></div>`;
}

module.exports = { renderBhajanPreviewCard };
