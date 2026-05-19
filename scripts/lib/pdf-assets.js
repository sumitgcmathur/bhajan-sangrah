const fs = require('fs');
const path = require('path');
const { ROOT } = require('./paths');

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/** Inline images as data URIs so headless print always embeds them. */
function createEmbeddedAssetResolver() {
  const cache = new Map();
  return (relativePath) => {
    if (!relativePath) return '';
    const rel = relativePath.replace(/^\//, '');
    const filePath = path.join(ROOT, rel);
    if (cache.has(filePath)) return cache.get(filePath);
    if (!fs.existsSync(filePath)) return '';
    const mime = MIME[path.extname(filePath).toLowerCase()] || 'image/jpeg';
    const data = fs.readFileSync(filePath).toString('base64');
    const uri = `data:${mime};base64,${data}`;
    cache.set(filePath, uri);
    return uri;
  };
}

module.exports = { createEmbeddedAssetResolver };
