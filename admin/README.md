# Bhajan Sangrah — Admin (Vercel)

Mobile-friendly editor that commits `content/*.yaml` to **main** via GitHub API. Only the GitHub user in `ALLOWED_GITHUB_USER` may log in.

## This deployment

**Use the Production domain** from Vercel → Project → **Settings → Domains** (not the per-deploy URL like `…-k4z0usdv2-….vercel.app`).

| Setting | Value |
|---------|--------|
| Admin URL | `https://bhajan-sangrah-admin.vercel.app` |
| OAuth callback | `https://bhajan-sangrah-admin.vercel.app/api/auth/callback` |
| Allowed user | `sumitgcmathur` |
| Target repo | `sumitgcmathur/bhajan-sangrah` |

Optional: add alias `sm-bhajan-editor.vercel.app` under **Domains**, then use that URL everywhere instead.

## Setup

### 1. GitHub OAuth App

[GitHub → Settings → Developer settings → OAuth Apps → New](https://github.com/settings/applications/new)

- **Application name:** e.g. `Bhajan Sangrah Admin`  
- **Homepage URL:** your **production** domain (e.g. `https://bhajan-sangrah-admin.vercel.app`)  
- **Callback URL:** same host + `/api/auth/callback`

Note **Client ID** and generate **Client secret**.

The OAuth app owner must have **write access** to `GITHUB_OWNER/GITHUB_REPO`.

### 2. Vercel project

1. [vercel.com](https://vercel.com) → **Add New Project** → import `bhajan-sangrah` repo  
2. **Root Directory:** `admin`  
3. **Environment variables** (Production):

| Variable | Value |
|----------|--------|
| `GITHUB_CLIENT_ID` | from OAuth app |
| `GITHUB_CLIENT_SECRET` | from OAuth app |
| `ALLOWED_GITHUB_USER` | `sumitgcmathur` |
| `GITHUB_OWNER` | `sumitgcmathur` |
| `GITHUB_REPO` | `bhajan-sangrah` |
| `SESSION_SECRET` | run `openssl rand -hex 32` |
| `ADMIN_BASE_URL` | production domain, e.g. `https://bhajan-sangrah-admin.vercel.app` |

4. Deploy. Open the admin URL → **GitHub से लॉगिन**.

### 3. After publish

Each save commits to **main**. Your existing GitHub Action runs `node scripts/build.js` and updates the public site on `gh-pages`.

## Local dev

```bash
cd admin
npm install
cp .env.example .env.local
# fill .env.local — use http://127.0.0.1:3000 as ADMIN_BASE_URL and matching OAuth callback
npx vercel dev
```

## Troubleshooting OAuth / 404 after GitHub

1. **GitHub OAuth app** (separate from Vercel): [Developer settings → your app](https://github.com/settings/developers) → **Authorization callback URL** must be exactly  
   `https://bhajan-sangrah-admin.vercel.app/api/auth/callback`  
   Changing only `ADMIN_BASE_URL` in Vercel does **not** update GitHub.

2. **Vercel env scope**: each variable must apply to **Production** (not Preview only), then **Redeploy**.

3. **Use the production URL** in the browser — not the deploy URL (`…-k4z0usdv2-….vercel.app`).

4. After login, if you see `/?error=…` on `bhajan-sangrah-admin.vercel.app`, the callback worked; read the error (`not_allowed`, `invalid_state`, etc.).

5. **`sm-bhajan-editor.vercel.app`**: Vercel assigns `bhajan-sangrah-admin.vercel.app` from the project name. To use another hostname: **Settings → Domains → Add** `sm-bhajan-editor.vercel.app`, then update GitHub callback + `ADMIN_BASE_URL` to match.

## Security

- Login is checked against `ALLOWED_GITHUB_USER` on the server.  
- GitHub token is stored in an **HttpOnly** signed cookie, not in the browser JS.  
- Do not link the admin URL from the public bhajan site.  
- Keep the repo collaborator list minimal.
