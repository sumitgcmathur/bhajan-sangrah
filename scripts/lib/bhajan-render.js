const { enrichBhajanLyrics } = require('./lyrics-structure');
const { renderBhajanCard } = require('./template');
const { anchorId } = require('./slug');

/** Full section entry from config, or the passed stub if slug is unknown. */
function resolveSection(section, config) {
  const slug = section?.slug;
  if (!slug) return section || {};
  return (config.sections || []).find((s) => s.slug === slug) || section;
}

function showSwarachitBadgeForSection(section) {
  return section?.slug !== 'swarachit';
}

/**
 * Bhajan record passed to renderBhajanCard — same shape as scripts/build.js.
 * Use this (and renderBhajanCardFromDoc) for site HTML, admin preview, and PDF.
 */
function prepareBhajanForRender(doc, section, config, opts = {}) {
  const index = Number.isFinite(opts.index) ? Math.max(0, Math.floor(opts.index)) : 0;
  const sectionEntry = resolveSection(section, config);
  const slug = sectionEntry.slug || section.slug || 'preview';
  const title = String(doc.title || '').trim() || 'Untitled';
  const romantitle = String(doc.romantitle || '').trim() || title;
  return {
    title,
    romantitle,
    tarz: doc.tarz,
    group: doc.group,
    swarachit: doc.swarachit,
    lyrics: enrichBhajanLyrics(doc.lyrics, sectionEntry, doc, config),
    id: opts.id || doc.id || anchorId(slug, title, index),
  };
}

/** One public-site bhajan card (<article class="bhajan-card">…). */
function renderBhajanCardFromDoc(doc, section, config, opts = {}) {
  const index = Number.isFinite(opts.index) ? Math.max(0, Math.floor(opts.index)) : 0;
  const sectionEntry = resolveSection(section, config);
  const bhajan = prepareBhajanForRender(doc, sectionEntry, config, { ...opts, index });
  const html = renderBhajanCard(
    bhajan,
    sectionEntry,
    index,
    showSwarachitBadgeForSection(sectionEntry)
  );
  return { html, bhajan, section: sectionEntry };
}

module.exports = {
  resolveSection,
  showSwarachitBadgeForSection,
  prepareBhajanForRender,
  renderBhajanCardFromDoc,
};
