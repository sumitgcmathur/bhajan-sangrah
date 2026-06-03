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

## Favicon

Admin uses a tweaked variant of the site favicon (maroon ring + edit badge). Regenerate after changing `assets/icons/favicon.jpg`:

```bash
npm run admin:favicon
```

On Windows without npm, run `powershell -File scripts/generate-admin-favicon.ps1` (PNG) and `node scripts/generate-admin-favicon.js` (SVG).

## Find & replace (all bhajan YAML)

From the **Sections** screen, open **Find & replace (all YAML)**.

1. Enter find / replace text (minimum 2 characters to find).
2. **Preview matches** — scans in batches with a progress bar; **Cancel** stops the search (no commits).
3. **Apply to all matches** — same progress + cancel; each changed file is a separate commit on `main` (cancel does not undo commits already made).

Options: regular expression, case insensitive. Raw file text is updated (YAML structure is preserved if you only change lyrics text).

## Spell check (bhajan editor)

On the edit screen:

- **Browser underline** — fields use `lang="hi-IN"` and `spellcheck` (OS dictionary).
- **Check spelling** — Hunspell in the browser ([espells](https://www.npmjs.com/package/espells) + [hindi-hunspell](https://github.com/Shreeshrii/hindi-hunspell) `hi_IN` dictionary). First check may take 30–60s while ~5&nbsp;MB downloads.
- **Ignore word** — stored in this browser session only (not in the repo).
- **Publish** — runs spell check if needed; warns if unknown words remain.

## Voice typing (edit screen)

On phones, each text field shows a **mic** button when the browser supports the Web Speech API (Chrome on Android, Safari on iOS 14.5+). Dictation uses Hindi (`hi-IN`). Tap again to stop. If the mic button is missing, use the **microphone on your Hindi keyboard** (Gboard / iOS).

## Local dev

```bash
cd admin
npm install
cp .env.example .env.local
# fill .env.local — use http://127.0.0.1:3000 as ADMIN_BASE_URL and matching OAuth callback
npx vercel dev
```

## Vercel shows failed `gh-pages` deployments

GitHub Actions pushes the **built site** to the `gh-pages` branch. Vercel must **not** deploy that branch (only `main` with Root Directory `admin`).

`admin/vercel.json` disables `gh-pages` for commits on **main**, but each `gh-pages` push only contains the built `docs/` output — no `admin/vercel.json`. Vercel reads config from the branch it is deploying, so you need **`docs/vercel.json`** (written by `scripts/build.js` on every build) on `gh-pages` with `"git": { "deploymentEnabled": false }`.

After the next push to `main` (CI rebuilds `gh-pages`), new `gh-pages` commits should stop triggering failed Vercel builds. Old failed rows in the dashboard stay as history.

**Immediate fix (no code wait):** Vercel project → **Settings → Git** → **Ignored Build Step** → Custom:

```bash
[ "$VERCEL_GIT_COMMIT_REF" = "gh-pages" ]
```

(Exit `0` skips the build; exit `1` builds. This runs before Vercel looks for Root Directory `admin` on `gh-pages`.)

Also confirm **Root Directory** = `admin` and **Production Branch** = `main`. Your public site is **GitHub Pages**, not Vercel.

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
