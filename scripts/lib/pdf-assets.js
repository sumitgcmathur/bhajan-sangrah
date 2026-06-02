const fs = require('fs');
const path = require('path');
const { ROOT } = require('./paths');
const { landingBannerPath } = require('./banner-thumbs');

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

function normRel(relativePath) {
  return String(relativePath || '')
    .replace(/^\//, '')
    .replace(/\\/g, '/');
}

function pathToFileURL(filePath) {
  const resolved = path.resolve(filePath).replace(/\\/g, '/');
  return `file:///${resolved.startsWith('/') ? resolved.slice(1) : resolved}`;
}

function absFromRel(relativePath) {
  return path.join(ROOT, normRel(relativePath));
}

/** Inline images as data URIs (browser preview only — inflates PDF size). */
function createEmbeddedAssetResolver() {
  const cache = new Map();
  return (relativePath) => {
    const rel = normRel(relativePath);
    if (!rel) return { full: '', blur: '', thumb: '' };
    const filePath = absFromRel(rel);
    if (cache.has(filePath)) {
      const uri = cache.get(filePath);
      return { full: uri, blur: uri, thumb: uri };
    }
    if (!fs.existsSync(filePath)) return { full: '', blur: '', thumb: '' };
    const mime = MIME[path.extname(filePath).toLowerCase()] || 'image/jpeg';
    const data = fs.readFileSync(filePath).toString('base64');
    const uri = `data:${mime};base64,${data}`;
    cache.set(filePath, uri);
    return { full: uri, blur: uri, thumb: uri };
  };
}

/**
 * File URLs for PDF export. Banner backdrops use CSS gradients (pdf-export.css);
 * only the sharp center image is loaded from disk.
 */
async function createPdfAssetResolver(config, sectionPayloads) {
  const relPaths = new Set();
  if (config.home_banner) relPaths.add(normRel(config.home_banner));
  for (const { section } of sectionPayloads) {
    if (section.banner) relPaths.add(normRel(section.banner));
    const thumbRel = landingBannerPath(section);
    if (thumbRel && fs.existsSync(absFromRel(thumbRel))) {
      relPaths.add(normRel(thumbRel));
    }
  }

  const entries = new Map();

  for (const rel of relPaths) {
    const abs = absFromRel(rel);
    if (!fs.existsSync(abs)) continue;
    const full = pathToFileURL(abs);
    entries.set(rel, { full, blur: '', thumb: full });
  }

  return (relativePath, { section } = {}) => {
    const rel = normRel(relativePath);
    if (!rel) return { full: '', blur: '', thumb: '' };

    const thumbRel = section ? normRel(landingBannerPath(section)) : '';
    if (thumbRel && entries.has(thumbRel)) return entries.get(thumbRel);

    if (entries.has(rel)) return entries.get(rel);

    const abs = absFromRel(rel);
    if (!fs.existsSync(abs)) return { full: '', blur: '', thumb: '' };
    const url = pathToFileURL(abs);
    return { full: url, blur: '', thumb: url };
  };
}

module.exports = {
  createEmbeddedAssetResolver,
  createPdfAssetResolver,
  pathToFileURL,
  normRel,
};
