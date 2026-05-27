const { readSession } = require('../../lib/session');
const { sendJson } = require('../../lib/http');

module.exports = async (req, res) => {
  const session = await readSession(req);
  if (!session) {
    sendJson(res, 401, { ok: false });
    return;
  }
  sendJson(res, 200, { ok: true, login: session.login });
};
