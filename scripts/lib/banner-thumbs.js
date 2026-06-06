const fs = require('fs');
const path = require('path');
const { ROOT, ASSETS } = require('./paths');

const BANNERS_DIR = path.join(ASSETS, 'banners');
const MENU_DIR = path.join(ASSETS, 'menu');
/** Hero / PDF / source icon (portrait cover) */
const SOURCE_WIDTH = 704;
const SOURCE_HEIGHT = 1522;
const SOURCE_JPEG_QUALITY = 88;
/** Match section card aspect (704×1522); cover crop so every thumb is identical size */
const THUMB_WIDTH = 352;
const THUMB_HEIGHT = Math.round((THUMB_WIDTH * 1522) / 704);
const JPEG_QUALITY = 82;
/** Square crops for left sidebar (same source as landing tiles) */
const MENU_ICON_SIZE = 40;
const MENU_JPEG_QUALITY = 78;

function loadSharp() {
  return require('sharp');
}

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

  const sharp = loadSharp();
  await sharp(srcAbs)
    .rotate()
    .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toFile(destAbs);

  const kb = Math.round(fs.statSync(destAbs).size / 1024);
  console.log(`banner-thumbs: ${path.relative(ROOT, destAbs)} (${kb} KB)`);
}

async function writeMenuIcon(srcRel, destAbs, { force = false } = {}) {
  const srcAbs = resolveAsset(srcRel);
  if (!fs.existsSync(srcAbs)) {
    console.warn(`menu-icons: missing source ${srcRel}`);
    return;
  }
  if (!force && !needsRebuild(srcAbs, destAbs)) return;

  const sharp = loadSharp();
  await sharp(srcAbs)
    .rotate()
    .resize(MENU_ICON_SIZE, MENU_ICON_SIZE, { fit: 'fill' })
    .jpeg({ quality: MENU_JPEG_QUALITY, mozjpeg: true })
    .toFile(destAbs);

  const kb = Math.round(fs.statSync(destAbs).size / 1024);
  console.log(`menu-icons: ${path.relative(ROOT, destAbs)} (${kb} KB)`);
}

async function generateBannerThumbs(config, { force = false } = {}) {
  const sections = config.sections || [];
  fs.mkdirSync(BANNERS_DIR, { recursive: true });
  fs.mkdirSync(MENU_DIR, { recursive: true });

  if (config.home_banner) {
    await writeThumb(config.home_banner, path.join(BANNERS_DIR, 'home.jpg'), { force });
    await writeMenuIcon(config.home_banner, path.join(MENU_DIR, 'home.jpg'), { force });
  }

  for (const section of sections) {
    if (!section.banner) continue;
    await writeThumb(section.banner, path.join(BANNERS_DIR, `${section.slug}.jpg`), { force });
    await writeMenuIcon(section.banner, path.join(MENU_DIR, `${section.slug}.jpg`), { force });
  }
}

function warnMissingThumbs(config) {
  const missing = [];
  const missingMenu = [];
  if (config.home_banner && !fs.existsSync(path.join(BANNERS_DIR, 'home.jpg'))) {
    missing.push('home.jpg');
  }
  if (config.home_banner && !fs.existsSync(path.join(MENU_DIR, 'home.jpg'))) {
    missingMenu.push('home.jpg');
  }
  for (const section of config.sections || []) {
    if (!section.banner) continue;
    const thumb = path.join(BANNERS_DIR, `${section.slug}.jpg`);
    if (!fs.existsSync(thumb)) missing.push(`${section.slug}.jpg`);
    const menu = path.join(MENU_DIR, `${section.slug}.jpg`);
    if (!fs.existsSync(menu)) missingMenu.push(`${section.slug}.jpg`);
  }
  if (missing.length) {
    console.warn(
      `Missing landing thumbnails: ${missing.join(', ')}. Run: npm run build:banners`
    );
  }
  if (missingMenu.length) {
    console.warn(
      `Missing sidebar menu icons: ${missingMenu.join(', ')}. Run: npm run build:banners`
    );
  }
}

function landingBannerPath(section) {
  return `assets/banners/${section.slug}.jpg`;
}

function landingHomeBannerPath() {
  return 'assets/banners/home.jpg';
}

function sidebarMenuIconPath(section) {
  return `assets/menu/${section.slug}.jpg`;
}

function sidebarMenuHomePath() {
  return 'assets/menu/home.jpg';
}

function defaultSectionIconPath(section) {
  return `assets/icons/${section.slug}.jpg`;
}

function resolveSectionIconPath(section) {
  return section?.banner || defaultSectionIconPath(section);
}

function homeIconPath(config) {
  return config?.home_banner || 'assets/icons/LandingPage.jpg';
}

function thumbPathForSlug(slug) {
  return `assets/banners/${slug}.jpg`;
}

function menuPathForSlug(slug) {
  return `assets/menu/${slug}.jpg`;
}

/** Process upload → source 704×1522 + landing tile + menu icon buffers. */
async function processBannerUpload(input) {
  const sharp = loadSharp();
  const source = await sharp(input)
    .rotate()
    .resize(SOURCE_WIDTH, SOURCE_HEIGHT, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: SOURCE_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

  const thumb = await sharp(source)
    .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

  const menu = await sharp(source)
    .resize(MENU_ICON_SIZE, MENU_ICON_SIZE, { fit: 'fill' })
    .jpeg({ quality: MENU_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

  return { source, thumb, menu };
}

module.exports = {
  SOURCE_WIDTH,
  SOURCE_HEIGHT,
  THUMB_WIDTH,
  THUMB_HEIGHT,
  MENU_ICON_SIZE,
  generateBannerThumbs,
  warnMissingThumbs,
  processBannerUpload,
  landingBannerPath,
  landingHomeBannerPath,
  sidebarMenuIconPath,
  sidebarMenuHomePath,
  defaultSectionIconPath,
  resolveSectionIconPath,
  homeIconPath,
  thumbPathForSlug,
  menuPathForSlug,
};
