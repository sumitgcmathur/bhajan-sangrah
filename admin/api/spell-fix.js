const { requireAuth, readBody, sendJson } = require('../lib/http');
const { getFile, putFile } = require('../lib/github');
const { listBhajanYamlPaths } = require('../lib/content-files');
const { parseBhajanYaml, serializeBhajanDoc } = require('../lib/yaml-bridge');
const { replaceWordInDoc } = require('../lib/bhajan-text-fields');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const session = await requireAuth(req, res);
  if (!session) return;

  try {
    const body = await readBody(req);
    const word = String(body?.word ?? '').trim();
    const replacement = String(body?.replacement ?? '');
    if (!word) {
      sendJson(res, 400, { error: 'word required' });
      return;
    }
    if (!replacement) {
      sendJson(res, 400, { error: 'replacement required' });
      return;
    }

    let paths = Array.isArray(body.paths) ? body.paths.map(String).filter(Boolean) : null;
    if (!paths?.length) {
      const listed = await listBhajanYamlPaths(session.accessToken);
      paths = listed.paths;
    }

    const updated = [];
    let totalReplacements = 0;

    for (const filePath of paths) {
      if (!filePath.startsWith('content/') || filePath.includes('..')) continue;
      const file = await getFile(filePath, session.accessToken);
      if (!file) continue;
      const doc = parseBhajanYaml(file.content);
      const { doc: nextDoc, count } = replaceWordInDoc(doc, word, replacement);
      if (!count) continue;
      const content = serializeBhajanDoc(nextDoc);
      const msg = `admin: spell fix «${word}» → «${replacement}» (${count} in ${filePath})`;
      await putFile(filePath, content, msg, session.accessToken, file.sha);
      totalReplacements += count;
      updated.push({ path: filePath, count });
    }

    sendJson(res, 200, {
      word,
      replacement,
      filesUpdated: updated.length,
      totalReplacements,
      files: updated,
    });
  } catch (e) {
    sendJson(res, e.status || 500, { error: e.message });
  }
};
