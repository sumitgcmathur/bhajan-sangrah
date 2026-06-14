const path = require('path');
const { requireAuth, sendJson, readBody } = require('../lib/http');
const { getFile, putFile, deleteFile, listDir } = require('../lib/github');
const { parseSectionsYaml, parseBhajanYaml, serializeBhajanDoc, docToEditor, editorToDoc } = require('../lib/yaml-bridge');

const { bhajanFilename, bhajanPathForTitle, titleSlugDiffersFromPath } = require(path.join(
  __dirname,
  '..',
  '..',
  'scripts',
  'lib',
  'slug',
));

function safeContentPath(p) {
  const norm = String(p || '').replace(/\\/g, '/');
  if (!norm.startsWith('content/') || norm.includes('..')) return null;
  return norm;
}

module.exports = async (req, res) => {
  const session = await requireAuth(req, res);
  if (!session) return;

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const filePath = safeContentPath(url.searchParams.get('path'));
      if (!filePath) {
        sendJson(res, 400, { error: 'Invalid path' });
        return;
      }
      const file = await getFile(filePath, session.accessToken);
      if (!file) {
        sendJson(res, 404, { error: 'Not found' });
        return;
      }
      const doc = parseBhajanYaml(file.content);
      sendJson(res, 200, {
        path: filePath,
        sha: file.sha,
        editor: docToEditor(doc),
      });
      return;
    }

    if (req.method === 'PUT') {
      const body = await readBody(req);
      const filePath = safeContentPath(body?.path);
      if (!filePath || !body?.editor) {
        sendJson(res, 400, { error: 'path and editor required' });
        return;
      }
      const doc = editorToDoc(body.editor);
      const title = (doc.title || '').trim();
      if (!title || title === 'Untitled') {
        sendJson(res, 400, { error: 'title required' });
        return;
      }
      const romantitle = (doc.romantitle || '').trim();
      if (!romantitle) {
        sendJson(res, 400, { error: 'romantitle required' });
        return;
      }
      doc.title = title;
      doc.romantitle = romantitle;
      const yaml = serializeBhajanDoc(doc);
      const message = body.message || `admin: update ${title}`;
      let sha = body.sha;
      if (!sha) {
        const existing = await getFile(filePath, session.accessToken);
        sha = existing?.sha;
      }
      const folder = filePath.replace(/\\/g, '/').replace(/\/[^/]+$/, '');
      const items = await listDir(folder, session.accessToken);
      const currentBase = path.basename(filePath);
      const names = new Set(items.filter((f) => f.type === 'file').map((f) => f.name));
      names.delete(currentBase);
      const targetPath = bhajanPathForTitle(filePath, title, names);
      const renamed = titleSlugDiffersFromPath(filePath, title) && targetPath !== filePath;
      let result;
      if (renamed) {
        if (!sha) {
          sendJson(res, 409, { error: 'Cannot rename file: missing version (sha). Reload and try again.' });
          return;
        }
        const renameMsg = `admin: rename ${currentBase} → ${path.basename(targetPath)} (${title})`;
        result = await putFile(targetPath, yaml, renameMsg, session.accessToken);
        await deleteFile(filePath, renameMsg, session.accessToken, sha);
      } else {
        result = await putFile(filePath, yaml, message, session.accessToken, sha);
      }
      sendJson(res, 200, {
        path: renamed ? targetPath : filePath,
        sha: result.content?.sha,
        commit: result.commit?.html_url,
        renamed,
        previousPath: renamed ? filePath : undefined,
      });
      return;
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const sectionSlug = body?.section;
      if (!sectionSlug || !body?.editor) {
        sendJson(res, 400, { error: 'section and editor required' });
        return;
      }
      const secFile = await getFile('content/sections.yaml', session.accessToken);
      const config = parseSectionsYaml(secFile.content);
      const section = (config.sections || []).find((s) => s.slug === sectionSlug);
      if (!section) {
        sendJson(res, 404, { error: 'Unknown section' });
        return;
      }
      const folder = section.folder || sectionSlug;
      const items = await listDir(`content/${folder}`, session.accessToken);
      const names = new Set(items.filter((f) => f.type === 'file').map((f) => f.name));
      const doc = editorToDoc(body.editor);
      const title = (doc.title || '').trim();
      if (!title || title === 'Untitled') {
        sendJson(res, 400, { error: 'title required' });
        return;
      }
      const romantitle = (doc.romantitle || '').trim();
      if (!romantitle) {
        sendJson(res, 400, { error: 'romantitle required' });
        return;
      }
      doc.title = title;
      doc.romantitle = romantitle;
      const fileName = bhajanFilename(title, names.size, names);
      const filePath = `content/${folder}/${fileName}`;
      const yaml = serializeBhajanDoc(doc);
      const message = body.message || `admin: add ${doc.title}`;
      const result = await putFile(filePath, yaml, message, session.accessToken);
      sendJson(res, 201, {
        path: filePath,
        sha: result.content?.sha,
        commit: result.commit?.html_url,
      });
      return;
    }

    if (req.method === 'DELETE') {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const filePath = safeContentPath(url.searchParams.get('path'));
      const sha = url.searchParams.get('sha');
      if (!filePath || !sha) {
        sendJson(res, 400, { error: 'path and sha required' });
        return;
      }
      const message = url.searchParams.get('message') || `admin: delete ${filePath}`;
      await deleteFile(filePath, message, session.accessToken, sha);
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    sendJson(res, e.status || 500, { error: e.message });
  }
};
