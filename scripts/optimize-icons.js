#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { ROOT, ASSETS } = require('./lib/paths');
const { loadSections } = require('./lib/sections');
const { generateBannerThumbs } = require('./lib/banner-thumbs');

const ICONS_DIR = path.join(ASSETS, 'icons');
/** High quality mozjpeg — visually lossless for these banners; much smaller files */
const JPEG_QUALITY = 92;
const SKIP_UNDER_KB = 180;

async function optimizeIcon(filePath) {
  const kb = Math.round(fs.statSync(filePath).size / 1024);
  if (kb < SKIP_UNDER_KB) {
    console.log(`skip ${path.basename(filePath)} (${kb} KB)`);
    return false;
  }

  const sharp = require('sharp');
  const tmp = path.join(path.dirname(filePath), `.${path.basename(filePath)}.tmp`);
  const meta = await sharp(filePath).metadata();
  await sharp(filePath)
    .rotate()
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true, progressive: true })
    .toFile(tmp);

  const newKb = Math.round(fs.statSync(tmp).size / 1024);
  if (newKb >= kb) {
    fs.unlinkSync(tmp);
    console.log(`keep ${path.basename(filePath)} (${kb} KB, re-encode not smaller)`);
    return false;
  }

  fs.unlinkSync(filePath);
  fs.renameSync(tmp, filePath);
  console.log(
    `optimized ${path.basename(filePath)}: ${meta.width}x${meta.height}, ${kb} KB → ${newKb} KB`
  );
  return true;
}

async function main() {
  const files = fs
    .readdirSync(ICONS_DIR)
    .filter((f) => /\.jpe?g$/i.test(f))
    .map((f) => path.join(ICONS_DIR, f));

  let changed = 0;
  for (const file of files) {
    if (await optimizeIcon(file)) changed += 1;
  }

  console.log(`\n${changed} icon(s) optimized.`);
  await generateBannerThumbs(loadSections(), { force: true });
  console.log('Landing banners regenerated.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
