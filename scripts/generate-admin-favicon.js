/**
 * Build admin favicons from assets/icons/favicon.jpg.
 * Uses sharp when available; always writes favicon.svg (no deps).
 * Run: npm run admin:favicon  (or: node scripts/generate-admin-favicon.js)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'icons', 'favicon.jpg');
const OUT = path.join(ROOT, 'admin', 'public');

const ADMIN = '#9b2d4a';
const ADMIN_DARK = '#6b1f32';

function editBadgeSvg() {
  return `
  <g transform="translate(332 332)">
    <circle cx="68" cy="68" r="72" fill="${ADMIN}" stroke="#fff" stroke-width="6"/>
    <path fill="#fff" d="M38 98 L78 58 L98 78 L58 118 Z"/>
    <path fill="#fff" d="M82 54 l16 16-10 10-16-16z"/>
    <rect x="28" y="102" width="36" height="10" rx="3" fill="#fff" transform="rotate(-42 46 107)"/>
  </g>`;
}

function writeSvgFavicon() {
  const b64 = fs.readFileSync(SRC).toString('base64');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512">
  <defs>
    <clipPath id="round"><circle cx="256" cy="256" r="236"/></clipPath>
  </defs>
  <image href="data:image/jpeg;base64,${b64}" x="0" y="0" width="512" height="512" clip-path="url(#round)" preserveAspectRatio="xMidYMid slice"/>
  <circle cx="256" cy="256" r="238" fill="none" stroke="${ADMIN}" stroke-width="14"/>
  <circle cx="256" cy="256" r="228" fill="none" stroke="${ADMIN_DARK}" stroke-width="4" opacity="0.5"/>
  ${editBadgeSvg()}
</svg>`;
  fs.writeFileSync(path.join(OUT, 'favicon.svg'), svg);
  console.log('wrote', path.join(OUT, 'favicon.svg'));
}

async function writePngWithSharp() {
  const sharp = require('sharp');
  const ADMIN_RGB = { r: 155, g: 45, b: 74 };

  function editBadgePng(size) {
    const r = size / 2;
    return Buffer.from(`
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${r}" cy="${r}" r="${r * 0.94}" fill="rgb(${ADMIN_RGB.r},${ADMIN_RGB.g},${ADMIN_RGB.b})"/>
        <circle cx="${r}" cy="${r}" r="${r * 0.82}" fill="none" stroke="#fff" stroke-width="${Math.max(2, size * 0.06)}"/>
        <path fill="#fff" d="M${r * 0.32} ${r * 1.38} L${r * 0.92} ${r * 0.78} L${r * 1.22} ${r * 1.08} L${r * 0.62} ${r * 1.68} Z"/>
        <path fill="#fff" d="M${r * 0.98} ${r * 0.72} l${r * 0.22} ${r * 0.22} l${-r * 0.14} ${r * 0.14} l${-r * 0.22} ${-r * 0.22}z"/>
        <rect x="${r * 0.24}" y="${r * 1.42}" width="${r * 0.5}" height="${r * 0.14}" rx="${r * 0.05}" fill="#fff" transform="rotate(-42 ${r * 0.49} ${r * 1.49})"/>
      </svg>`);
  }

  function ringPng(size) {
    const r = size / 2;
    const stroke = Math.max(3, Math.round(size * 0.045));
    return Buffer.from(`
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${r}" cy="${r}" r="${r - stroke / 2}" fill="none" stroke="rgb(${ADMIN_RGB.r},${ADMIN_RGB.g},${ADMIN_RGB.b})" stroke-width="${stroke}"/>
      </svg>`);
  }

  async function master(size) {
    const badgeSize = Math.round(size * 0.36);
    const badgeOffset = size - badgeSize + Math.round(size * 0.04);
    const base = await sharp(SRC).resize(size, size, { fit: 'cover' }).modulate({ brightness: 1.02, saturation: 1.08 }).png().toBuffer();
    const ring = await sharp(ringPng(size)).png().toBuffer();
    const badge = await sharp(editBadgePng(badgeSize)).png().toBuffer();
    return sharp(base)
      .composite([
        { input: ring, top: 0, left: 0 },
        { input: badge, top: badgeOffset, left: badgeOffset },
      ])
      .png()
      .toBuffer();
  }

  const buf = await master(512);
  for (const [name, px] of [
    ['apple-touch-icon.png', 180],
    ['favicon-32.png', 32],
    ['favicon-16.png', 16],
  ]) {
    await sharp(buf).resize(px, px).png().toFile(path.join(OUT, name));
    console.log('wrote', path.join(OUT, name));
  }
  await sharp(buf).resize(32, 32).toFile(path.join(OUT, 'favicon.ico'));
  console.log('wrote', path.join(OUT, 'favicon.ico'));
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error('Missing source:', SRC);
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });
  try {
    await writePngWithSharp();
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') {
      console.warn('sharp not installed — wrote SVG fallback. Run: npm install && npm run admin:favicon');
      writeSvgFavicon();
      return;
    }
    throw e;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
