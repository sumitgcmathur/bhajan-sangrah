const { requireAuth, readBody, sendJson } = require('../lib/http');
const { checkTexts } = require('../lib/hindi-spell');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const session = await requireAuth(req, res);
  if (!session) return;

  try {
    const body = await readBody(req);
    const texts = Array.isArray(body?.texts) ? body.texts : [];
    if (!texts.length) {
      sendJson(res, 400, { error: 'texts array required' });
      return;
    }
    if (texts.length > 40) {
      sendJson(res, 400, { error: 'Too many fields (max 40)' });
      return;
    }

    const normalized = texts.map((t, i) => ({
      id: String(t.id || `field-${i}`),
      label: String(t.label || t.id || `Field ${i + 1}`),
      text: String(t.text || ''),
    }));

    const ignoreWords = Array.isArray(body?.ignoreWords) ? body.ignoreWords : [];
    const result = await checkTexts(normalized, ignoreWords);
    sendJson(res, 200, result);
  } catch (e) {
    sendJson(res, 500, { error: e.message || 'Spell check failed' });
  }
};
