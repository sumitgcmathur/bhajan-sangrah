const fs = require('fs');
const path = require('path');
const { ROOT, ASSETS } = require('./paths');

const BANNERS_DIR = path.join(ASSETS, 'banners');
/** Match section card aspect (704×1522); cover crop so every thumb is identical size */
const THUMB_WIDTH = 352;
const THUMB_HEIGHT = Math.round((THUMB_WIDTH * 1522) / 704);
const JPEG_QUALITY = 82;

function resolveAsset(relPath) {
  return path.join(ROOT, relPath.replace(/\//g, path.sep));
}

function needsRebuild(src, dest) {
  if (!fs.existsSync(src)) return false;
  if (!fs.existsSync(dest)) return true;
  return fs.statSync(src).mtimeMs > fs.statSync(dest).mtimeMs;
}

async function writeThumb(srcRel, destAbs, { force = false } = {}) {
  const srcAbs = resolveAsset(srcRel);
  if (!fs.existsSync(srcAbs)) {
    console.warn(`banner-thumbs: missing source ${srcRel}`);
    return;
  }
  if (!force && !needsRebuild(srcAbs, destAbs)) return;

  const sharp = require('sharp');
  await sharp(srcAbs)
    .rotate()
    .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toFile(destAbs);

  const kb = Math.round(fs.statSync(destAbs).size / 1024);
  console.log(`banner-thumbs: ${path.relative(ROOT, destAbs)} (${kb} KB)`);
}

async function generateBannerThumbs(config, { force = false } = {}) {
  const sections = config.sections || [];
  fs.mkdirSync(BANNERS_DIR, { recursive: true });

  if (config.home_banner) {
    await writeThumb(config.home_banner, path.join(BANNERS_DIR, 'home.jpg'), { force });
  }

  for (const section of sections) {
    if (!section.banner) continue;
    await writeThumb(section.banner, path.join(BANNERS_DIR, `${section.slug}.jpg`), { force });
  }
}

function warnMissingThumbs(config) {
  const missing = [];
  if (config.home_banner && !fs.existsSync(path.join(BANNERS_DIR, 'home.jpg'))) {
    missing.push('home.jpg');
  }
  for (const section of config.sections || []) {
    if (!section.banner) continue;
    const thumb = path.join(BANNERS_DIR, `${section.slug}.jpg`);
    if (!fs.existsSync(thumb)) missing.push(`${section.slug}.jpg`);
  }
  if (missing.length) {
    console.warn(
      `Missing landing thumbnails: ${missing.join(', ')}. Run: npm run build:banners`
    );
  }
}

function landingBannerPath(section) {
  return `assets/banners/${section.slug}.jpg`;
}

function landingHomeBannerPath() {
  return 'assets/banners/home.jpg';
}

module.exports = {
  generateBannerThumbs,
  warnMissingThumbs,
  landingBannerPath,
  landingHomeBannerPath,
};
