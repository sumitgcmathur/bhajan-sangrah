const fs = require('fs');
const path = require('path');
const { ROOT } = require('./paths');
const { landingBannerPath } = require('./banner-thumbs');
const { pathToFileURL } = require('./pdf-assets');

/** Small JPEG for PDF bhajan-card watermarks (centered, no-repeat in pdf-export.css). */
/** Never use repeat/position:fixed in print CSS — Chromium rasterizes huge bitmaps (300–600 MB). */
const WM_WIDTH = 200;
const CACHE_DIR = path.join(ROOT, 'output', '.pdf-watermark-cache');

function loadSharp() {
  try {
    return require('sharp');
  } catch {
    return null;
  }
}

function absFromRel(rel) {
  return path.join(ROOT, String(rel || '').replace(/^\//, '').replace(/\//g, path.sep));
}

function sourceForSection(section) {
  if (!section?.banner) return '';
  const bannerAbs = absFromRel(section.banner);
  if (fs.existsSync(bannerAbs)) return bannerAbs;
  const thumbAbs = absFromRel(landingBannerPath(section));
  if (fs.existsSync(thumbAbs)) return thumbAbs;
  return '';
}

async function ensurePdfWatermarkFile(section) {
  const src = sourceForSection(section);
  if (!src) return '';

  const outPath = path.join(CACHE_DIR, `${section.slug}.jpg`);
  const srcMtime = fs.statSync(src).mtimeMs;
  if (fs.existsSync(outPath) && fs.statSync(outPath).mtimeMs >= srcMtime) {
    return pathToFileURL(outPath);
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const sharp = loadSharp();
  if (sharp) {
    const h = Math.round((WM_WIDTH * 1522) / 704);
    await sharp(src)
      .rotate()
      .resize(WM_WIDTH, h, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 70, mozjpeg: true })
      .toFile(outPath);
  } else {
    fs.copyFileSync(src, outPath);
  }
  return pathToFileURL(outPath);
}

/** slug → file:// URL of a tiny cached watermark JPEG */
async function buildPdfWatermarks(sectionPayloads) {
  const map = {};
  for (const { section } of sectionPayloads) {
    if (!section.banner) continue;
    const url = await ensurePdfWatermarkFile(section);
    if (url) map[section.slug] = url;
  }
  return map;
}

module.exports = { buildPdfWatermarks, WM_WIDTH };
