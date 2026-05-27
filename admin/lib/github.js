const { repo } = require('./config');

const API = 'https://api.github.com';

async function ghFetch(path, token, opts = {}) {
  const { owner, name } = repo();
  const url = path.startsWith('http') ? path : `${API}/repos/${owner}/${name}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const msg = data?.message || res.statusText || 'GitHub API error';
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function contentsPath(filePath) {
  return `/contents/${filePath.split('/').map(encodeURIComponent).join('/')}`;
}

async function getFile(path, token) {
  try {
    const data = await ghFetch(contentsPath(path), token);
    const content = Buffer.from(data.content, data.encoding || 'base64').toString('utf8');
    return { content, sha: data.sha };
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

async function putFile(path, content, message, token, sha) {
  const body = {
    message,
    content: Buffer.from(content, 'utf8').toString('base64'),
  };
  if (sha) body.sha = sha;
  return ghFetch(contentsPath(path), token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function deleteFile(path, message, token, sha) {
  return ghFetch(contentsPath(path), token, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sha }),
  });
}

async function listDir(dirPath, token) {
  try {
    const items = await ghFetch(`/contents/${dirPath}`, token);
    return Array.isArray(items) ? items : [];
  } catch (e) {
    if (e.status === 404) return [];
    throw e;
  }
}

async function exchangeCode(code) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const base = process.env.ADMIN_BASE_URL?.replace(/\/$/, '');
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${base}/api/auth/callback`,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return data.access_token;
}

async function getGitHubUser(token) {
  const res = await fetch(`${API}/user`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to load GitHub user');
  return data;
}

module.exports = {
  getFile,
  putFile,
  deleteFile,
  listDir,
  exchangeCode,
  getGitHubUser,
};
