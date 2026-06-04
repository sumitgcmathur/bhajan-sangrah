const { requireAuth, sendJson, readBody } = require('../lib/http');
const { renderBhajanPreviewCard } = require('../lib/bhajan-preview');

module.exports = async (req, res) => {
  const session = await requireAuth(req, res);
  if (!session) return;

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const body = await readBody(req);
    const editor = body?.editor;
    if (!editor || typeof editor !== 'object') {
      sendJson(res, 400, { error: 'editor required' });
      return;
    }
    const title = String(editor.title || '').trim();
    if (!title) {
      sendJson(res, 400, { error: 'title required' });
      return;
    }

    const section = {
      slug: String(body.sectionSlug || 'preview').trim() || 'preview',
      title: String(body.sectionTitle || '').trim() || 'Preview',
    };

    const html = renderBhajanPreviewCard(editor, section);
    sendJson(res, 200, { html });
  } catch (e) {
    sendJson(res, 500, { error: e.message || 'Preview failed' });
  }
};
