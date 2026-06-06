const { requireAuth, sendJson } = require('../lib/http');
const { getFile } = require('../lib/github');
const { parseSectionsYaml } = require('../lib/yaml-bridge');
module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }
  const session = await requireAuth(req, res);
  if (!session) return;

  try {
    const file = await getFile('content/sections.yaml', session.accessToken);
    if (!file) {
      sendJson(res, 500, { error: 'sections.yaml not found' });
      return;
    }
    const config = parseSectionsYaml(file.content);
    const sections = (config.sections || []).map((s) => ({
      slug: s.slug,
      folder: s.folder,
      title: s.title,
      banner: s.banner || '',
      grouped: Boolean(s.grouped),
    }));
    sendJson(res, 200, {
      site_title: config.site_title,
      sthayi_connect: config.sthayi_connect,
      sections,
    });
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
};
