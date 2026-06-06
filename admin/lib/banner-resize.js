const path = require('path');

const ADMIN_ROOT = path.join(__dirname, '..');

const SOURCE_WIDTH = 704;
const SOURCE_HEIGHT = 1522;
const SOURCE_JPEG_QUALITY = 88;
const THUMB_WIDTH = 352;
const THUMB_HEIGHT = Math.round((THUMB_WIDTH * 1522) / 704);
const JPEG_QUALITY = 82;

/** Vercel installs deps under admin/; scripts/lib cannot resolve sharp from repo root. */
function loadSharp() {
  try {
    return require('sharp');
  } catch (_) {
    /* fall through */
  }
  const adminSharp = path.join(ADMIN_ROOT, 'node_modules', 'sharp');
  try {
    return require(adminSharp);
  } catch (_) {
    const err = new Error('sharp is not installed — run npm install in admin/');
    err.status = 500;
    throw err;
  }
}

/** Process upload → source 704×1522 + landing tile buffers. */
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

  return { source, thumb };
}

module.exports = { processBannerUpload };
