const path = require('path');
const { requireAuth, sendJson, readBody } = require('../lib/http');
const { getFile, putFile } = require('../lib/github');
const { parseSectionsYaml } = require('../lib/yaml-bridge');

const { dumpSectionsDoc } = require(path.join(__dirname, '..', '..', 'scripts', 'lib', 'yaml-io'));

const VALID_ORDERS = new Set(['file', 'title']);

module.exports = async (req, res) => {
  if (req.method !== 'PATCH' && req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const session = await requireAuth(req, res);
  if (!session) return;

  try {
    const body = await readBody(req);
    const slug = String(body?.slug || '').trim();
    const bhajan_order = String(body?.bhajan_order || '').trim().toLowerCase();

    if (!slug) {
      sendJson(res, 400, { error: 'slug required' });
      return;
    }
    if (!VALID_ORDERS.has(bhajan_order)) {
      sendJson(res, 400, { error: 'bhajan_order must be "file" or "title"' });
      return;
    }

    const file = await getFile('content/sections.yaml', session.accessToken);
    if (!file) {
      sendJson(res, 500, { error: 'sections.yaml not found' });
      return;
    }

    const config = parseSectionsYaml(file.content);
    const section = (config.sections || []).find((s) => s.slug === slug);
    if (!section) {
      sendJson(res, 404, { error: 'Unknown section' });
      return;
    }

    section.bhajan_order = bhajan_order;
    const header = '# Master section index — edit via add-section.js or directly\n';
    const yaml = header + dumpSectionsDoc(config);
    const message = `admin: ${slug} bhajan_order → ${bhajan_order}`;

    await putFile('content/sections.yaml', yaml, message, session.accessToken, file.sha);

    sendJson(res, 200, {
      slug,
      bhajan_order,
      section: {
        slug: section.slug,
        folder: section.folder,
        title: section.title,
        banner: section.banner || '',
        grouped: Boolean(section.grouped),
        bhajan_order: section.bhajan_order,
      },
    });
  } catch (e) {
    sendJson(res, e.status || 500, { error: e.message });
  }
};
