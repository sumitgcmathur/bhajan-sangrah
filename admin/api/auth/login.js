const crypto = require('crypto');
const { adminBaseUrl } = require('../../lib/config');
const { redirect } = require('../../lib/http');
const { clearSessionCookie } = require('../../lib/session');

function buildAuthorizeUrl(state) {
  const base = adminBaseUrl();
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', process.env.GITHUB_CLIENT_ID);
  url.searchParams.set('redirect_uri', `${base}/api/auth/callback`);
  url.searchParams.set('scope', 'repo');
  url.searchParams.set('state', state);
  return url.toString();
}

function oauthStateCookie(state) {
  const base = adminBaseUrl();
  const secure = base.startsWith('https') ? '; Secure' : '';
  return `bs_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end();
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const switchAccount = url.searchParams.get('switch') === '1';
  const state = crypto.randomBytes(16).toString('hex');
  const authorizeUrl = buildAuthorizeUrl(state);
  const cookies = [oauthStateCookie(state)];

  if (switchAccount) {
    cookies.push(clearSessionCookie());
    res.setHeader('Set-Cookie', cookies);
    const logoutReturn = `https://github.com/logout?return_to=${encodeURIComponent(authorizeUrl)}`;
    redirect(res, logoutReturn);
    return;
  }

  res.setHeader('Set-Cookie', cookies);
  redirect(res, authorizeUrl);
};
