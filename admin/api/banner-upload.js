const { requireAuth, sendJson, readBody } = require('../lib/http');
const { uploadBannerImage, MAX_BYTES } = require('../lib/banner-upload');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const session = await requireAuth(req, res);
  if (!session) return;

  try {
    const body = await readBody(req);
    const target = String(body?.target || '').trim();
    const image = body?.image;

    if (!target) {
      sendJson(res, 400, { error: 'target required (home or section slug)' });
      return;
    }
    if (!image || typeof image !== 'string') {
      sendJson(res, 400, { error: 'image required (base64)' });
      return;
    }

    let buffer;
    try {
      buffer = Buffer.from(image, 'base64');
    } catch {
      sendJson(res, 400, { error: 'Invalid base64 image' });
      return;
    }

    if (!buffer.length) {
      sendJson(res, 400, { error: 'Empty image' });
      return;
    }
    if (buffer.length > MAX_BYTES) {
      sendJson(res, 400, { error: `Image too large (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB)` });
      return;
    }

    const result = await uploadBannerImage(session.accessToken, target, buffer);
    sendJson(res, 200, result);
  } catch (e) {
    sendJson(res, e.status || 500, { error: e.message });
  }
};
