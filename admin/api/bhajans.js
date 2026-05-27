const { requireAuth, sendJson } = require('../lib/http');
const { getFile, listDir } = require('../lib/github');
const { parseSectionsYaml } = require('../lib/yaml-bridge');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }
  const session = await requireAuth(req, res);
  if (!session) return;

  const url = new URL(req.url, `http://${req.headers.host}`);
  const sectionSlug = url.searchParams.get('section');
  if (!sectionSlug) {
    sendJson(res, 400, { error: 'section query required' });
    return;
  }

  try {
    const secFile = await getFile('content/sections.yaml', session.accessToken);
    const config = parseSectionsYaml(secFile.content);
    const section = (config.sections || []).find((s) => s.slug === sectionSlug);
    if (!section) {
      sendJson(res, 404, { error: 'Unknown section' });
      return;
    }
    const folder = section.folder || sectionSlug;
    const items = await listDir(`content/${folder}`, session.accessToken);
    const bhajans = items
      .filter((f) => f.type === 'file' && /\.ya?ml$/i.test(f.name))
      .map((f) => ({ name: f.name, path: `content/${folder}/${f.name}` }))
      .sort((a, b) => a.name.localeCompare(b.name, 'hi'));
    sendJson(res, 200, { section, bhajans });
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
};
