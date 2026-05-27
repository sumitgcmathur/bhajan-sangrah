const { SignJWT, jwtVerify } = require('jose');

const COOKIE = 'bs_admin';
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function secretKey() {
  const raw = process.env.SESSION_SECRET;
  if (!raw || raw.length < 16) throw new Error('SESSION_SECRET must be at least 16 characters');
  return new TextEncoder().encode(raw);
}

async function createSessionCookie(payload) {
  const token = await new SignJWT({
    login: payload.login,
    gh: payload.accessToken,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secretKey());
  const secure = process.env.ADMIN_BASE_URL?.startsWith('https') ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure}`;
}

async function readSession(req) {
  const header = req.headers.cookie || '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!match) return null;
  try {
    const { payload } = await jwtVerify(match[1], secretKey());
    return { login: payload.login, accessToken: payload.gh };
  } catch {
    return null;
  }
}

function clearSessionCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

module.exports = { createSessionCookie, readSession, clearSessionCookie, COOKIE };
