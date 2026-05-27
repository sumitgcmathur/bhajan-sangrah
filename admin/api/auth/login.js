const crypto = require('crypto');
const { adminBaseUrl } = require('../../lib/config');
const { redirect } = require('../../lib/http');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end();
    return;
  }
  const state = crypto.randomBytes(16).toString('hex');
  const clientId = process.env.GITHUB_CLIENT_ID;
  const base = adminBaseUrl();
  const secure = base.startsWith('https') ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `bs_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`
  );
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', `${base}/api/auth/callback`);
  url.searchParams.set('scope', 'repo');
  url.searchParams.set('state', state);
  redirect(res, url.toString());
};
