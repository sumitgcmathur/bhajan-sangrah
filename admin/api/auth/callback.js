const { exchangeCode, getGitHubUser } = require('../../lib/github');
const { allowedUser, adminBaseUrl } = require('../../lib/config');
const { createSessionCookie } = require('../../lib/session');
const { redirect } = require('../../lib/http');

function readStateCookie(req) {
  const header = req.headers.cookie || '';
  const m = header.match(/(?:^|;\s*)bs_oauth_state=([^;]+)/);
  return m ? m[1] : null;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end();
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const err = url.searchParams.get('error');
  const base = adminBaseUrl();

  if (err) {
    redirect(res, `${base}/?error=${encodeURIComponent(err)}`);
    return;
  }
  if (!code || !state || state !== readStateCookie(req)) {
    redirect(res, `${base}/?error=invalid_state`);
    return;
  }

  try {
    const accessToken = await exchangeCode(code);
    const user = await getGitHubUser(accessToken);
    if (String(user.login || '').toLowerCase() !== allowedUser()) {
      redirect(res, `${base}/?error=not_allowed`);
      return;
    }
    const cookie = await createSessionCookie({
      login: user.login,
      accessToken,
    });
    res.setHeader('Set-Cookie', [
      cookie,
      'bs_oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    ]);
    redirect(res, `${base}/`);
  } catch (e) {
    redirect(res, `${base}/?error=${encodeURIComponent(e.message || 'auth_failed')}`);
  }
};
