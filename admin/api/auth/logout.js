const { clearSessionCookie } = require('../../lib/session');
const { adminBaseUrl } = require('../../lib/config');
const { redirect } = require('../../lib/http');

module.exports = async (req, res) => {
  res.setHeader('Set-Cookie', clearSessionCookie());
  redirect(res, `${adminBaseUrl()}/`);
};
