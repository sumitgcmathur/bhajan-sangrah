const { requireAuth, sendJson } = require('../lib/http');
const { getFile, listDir } = require('../lib/github');
const { parseSectionsYaml, parseBhajanYaml } = require('../lib/yaml-bridge');
const { sortBhajansForDisplay } = require('../../scripts/lib/sections');

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
    const yamlFiles = items
      .filter((f) => f.type === 'file' && /\.ya?ml$/i.test(f.name))
      .sort((a, b) => a.name.localeCompare(b.name, 'hi'));
    const seenGroups = new Set();
    const bhajans = await Promise.all(
      yamlFiles.map(async (f) => {
        const filePath = `content/${folder}/${f.name}`;
        let title = '';
        let group = '';
        const file = await getFile(filePath, session.accessToken);
        if (file) {
          const doc = parseBhajanYaml(file.content);
          title = (doc.title || '').trim();
          group = (doc.group || '').trim();
          if (group) seenGroups.add(group);
        }
        return { name: f.name, path: filePath, title, group };
      }),
    );

    const sorted = sortBhajansForDisplay(section, bhajans);
    const groups = section.grouped
      ? [...seenGroups].sort((a, b) => a.localeCompare(b, 'hi'))
      : [];

    const sectionOut = {
      ...section,
      banner: section.banner || `assets/icons/${section.slug}.jpg`,
      bhajan_order: section.bhajan_order === 'file' ? 'file' : 'title',
    };
    sendJson(res, 200, { section: sectionOut, bhajans: sorted, groups });
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
};
