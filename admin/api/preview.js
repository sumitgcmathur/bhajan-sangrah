const { requireAuth, sendJson, readBody } = require('../lib/http');
const { getFile } = require('../lib/github');
const { parseSectionsYaml } = require('../lib/yaml-bridge');
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

    let config = { sthayi_connect: true, sections: [] };
    const sectionsFile = await getFile('content/sections.yaml', session.accessToken);
    if (sectionsFile?.content) {
      config = parseSectionsYaml(sectionsFile.content);
    }

    const index = Number(body.bhajanIndex);
    const html = renderBhajanPreviewCard(editor, section, config, {
      index: Number.isFinite(index) ? index : 0,
    });
    sendJson(res, 200, { html });
  } catch (e) {
    sendJson(res, 500, { error: e.message || 'Preview failed' });
  }
};
