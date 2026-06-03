const { requireAuth, readBody, sendJson } = require('../lib/http');
const { getFile, putFile } = require('../lib/github');
const { listBhajanYamlPaths } = require('../lib/content-files');

const MIN_FIND_LEN = 2;
const MAX_PREVIEW_SNIPPETS = 3;
const SNIPPET_RADIUS = 40;

function snippetAround(text, index, findLen) {
  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end = Math.min(text.length, index + findLen + SNIPPET_RADIUS);
  let s = text.slice(start, end).replace(/\s+/g, ' ');
  if (start > 0) s = '…' + s;
  if (end < text.length) s += '…';
  return s;
}

function countAndReplace(content, find, replace, opts) {
  const { regex, caseInsensitive } = opts;

  if (!find) return { count: 0, next: content, snippets: [] };

  if (regex) {
    let re;
    try {
      const flags = caseInsensitive ? 'giu' : 'gu';
      re = new RegExp(find, flags);
    } catch (e) {
      const err = new Error(`Invalid regex: ${e.message}`);
      err.status = 400;
      throw err;
    }
    const snippets = [];
    let count = 0;
    let m;
    const globalRe = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    while ((m = globalRe.exec(content)) !== null) {
      count += 1;
      if (snippets.length < MAX_PREVIEW_SNIPPETS) {
        snippets.push(snippetAround(content, m.index, m[0].length));
      }
      if (m[0].length === 0) globalRe.lastIndex += 1;
    }
    const next = count ? content.replace(re, replace) : content;
    return { count, next, snippets };
  }

  const snippets = [];
  let count = 0;
  let pos = 0;
  const needle = caseInsensitive ? find.toLowerCase() : find;
  const hay = caseInsensitive ? content.toLowerCase() : content;

  while (pos < hay.length) {
    const idx = hay.indexOf(needle, pos);
    if (idx === -1) break;
    count += 1;
    if (snippets.length < MAX_PREVIEW_SNIPPETS) {
      snippets.push(snippetAround(content, idx, find.length));
    }
    pos = idx + Math.max(needle.length, 1);
  }

  let next = content;
  if (count) {
    if (caseInsensitive) {
      const re = new RegExp(escapeRegex(find), 'giu');
      next = content.replace(re, replace);
    } else {
      next = content.split(find).join(replace);
    }
  }

  return { count, next, snippets };
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function scanReplace(token, find, replace, opts, pathsOnly) {
  const files = [];
  let totalMatches = 0;

  for (const filePath of pathsOnly) {
    const file = await getFile(filePath, token);
    if (!file) continue;
    const { count, snippets } = countAndReplace(file.content, find, replace, opts);
    if (count > 0) {
      totalMatches += count;
      files.push({
        path: filePath,
        name: filePath.split('/').pop(),
        count,
        snippets,
      });
    }
  }

  files.sort((a, b) => b.count - a.count);
  return { files, totalMatches, filesAffected: files.length, filesScanned: pathsOnly.length };
}

async function applyReplace(token, find, replace, opts, pathsOnly) {
  const updated = [];
  let totalMatches = 0;

  for (const filePath of pathsOnly) {
    const file = await getFile(filePath, token);
    if (!file) continue;
    const { count, next } = countAndReplace(file.content, find, replace, opts);
    if (count > 0 && next !== file.content) {
      const msg = `admin: replace «${truncate(find, 40)}» (${count} in ${filePath})`;
      await putFile(filePath, next, msg, token, file.sha);
      totalMatches += count;
      updated.push({ path: filePath, count });
    }
  }

  return {
    filesUpdated: updated.length,
    totalMatches,
    files: updated,
  };
}

function truncate(s, n) {
  const t = String(s).replace(/\s+/g, ' ');
  return t.length <= n ? t : `${t.slice(0, n)}…`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const session = await requireAuth(req, res);
  if (!session) return;

  try {
    const body = await readBody(req);
    const find = String(body?.find ?? '');
    const replace = String(body?.replace ?? '');
    const dryRun = body?.dryRun !== false;
    const regex = Boolean(body?.regex);
    const caseInsensitive = Boolean(body?.caseInsensitive);

    if (find.length < MIN_FIND_LEN) {
      sendJson(res, 400, { error: `Find text must be at least ${MIN_FIND_LEN} characters` });
      return;
    }

    const opts = { regex, caseInsensitive };

    if (body.listPaths) {
      const { paths } = await listBhajanYamlPaths(session.accessToken);
      sendJson(res, 200, { paths, total: paths.length });
      return;
    }

    let pathsOnly = Array.isArray(body.paths) ? body.paths.map(String).filter(Boolean) : null;
    if (!pathsOnly?.length) {
      const listed = await listBhajanYamlPaths(session.accessToken);
      pathsOnly = listed.paths;
    }

    if (dryRun) {
      const result = await scanReplace(session.accessToken, find, replace, opts, pathsOnly);
      sendJson(res, 200, { dryRun: true, ...result });
      return;
    }

    const result = await applyReplace(session.accessToken, find, replace, opts, pathsOnly);
    sendJson(res, 200, { dryRun: false, ...result });
  } catch (e) {
    sendJson(res, e.status || 500, { error: e.message });
  }
};
