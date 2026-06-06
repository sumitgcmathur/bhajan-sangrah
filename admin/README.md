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

## When Vercel rebuilds the admin app

| Trigger | Admin deploy? | Public site (`gh-pages`)? |
|---------|---------------|---------------------------|
| Push to `main` with changes under `admin/`, `scripts/lib/`, or `assets/css/site.css` | **Yes** (Vercel) | Yes (GitHub Actions) |
| Push to `main` with **only** `content/` (or other non-admin paths) | **Skipped** (saves builds) | Yes (GitHub Actions) |
| Push to `gh-pages` | **No** (must not deploy) | Yes (GitHub Pages) |

`admin/vercel.json` sets `"ignoreCommand": "bash vercel-should-build.sh"` (path is relative to **Root Directory** `admin`, not the repo root). The script exits **1** (build) when admin-related files changed, **0** (skip) otherwise. It also skips the `gh-pages` branch.

**Merge commits:** The script diffs against **both** merge parents (and uses `VERCEL_GIT_PREVIOUS_SHA` when set). A plain `HEAD^..HEAD` diff on a merge often shows only `content/` even when `admin/` changed on the other side — that used to skip admin deploys incorrectly.

If admin is behind after a skipped deploy: Vercel dashboard → **Deployments** → **Redeploy** (latest `main`), or push any commit that touches `admin/`.

**Vercel project settings to confirm:**

1. **Root Directory:** `admin`
2. **Production Branch:** `main`
3. **Git → Ignored Build Step:** should use `ignoreCommand` from `vercel.json`, or paste: `bash vercel-should-build.sh` (not `admin/vercel-should-build.sh`)

If you prefer **every** `main` commit to redeploy admin (even content-only edits), remove `ignoreCommand` from `admin/vercel.json` and clear the Ignored Build Step in the dashboard.

**Production still on an old deploy?** Pushes that only change `content/` (spell-fix commits) **skip** the admin project. After admin-only commits (e.g. allowlist), Vercel should build; if not, use **Deployments → … → Redeploy** on latest `main`, or push any commit that touches `admin/`.

**Shared code:** Admin API routes `require()` `scripts/lib/` (YAML, preview HTML, slugs). Changes there trigger an admin rebuild even when `admin/public/` is unchanged.

## Favicon

Admin uses a tweaked variant of the site favicon (maroon ring + edit badge). Regenerate after changing `assets/icons/favicon.jpg`:

```bash
npm run admin:favicon
```

On Windows without npm, run `powershell -File scripts/generate-admin-favicon.ps1` (PNG) and `node scripts/generate-admin-favicon.js` (SVG).

## Banner images (landing + sections)

On **Sections** (home), use **Update image** for the landing page banner. On each section’s bhajan list (`#/s/{slug}`), use **Update image** for that section.

Upload accepts JPEG, PNG, WebP, or GIF (max **3 MB**). The server resizes and commits three assets to `main`:

| Output | Path | Size |
|--------|------|------|
| Hero & PDF | `assets/icons/…` or `home_banner` path | 704×1522 JPEG |
| Landing grid tile | `assets/banners/{slug\|home}.jpg` | 352×761 JPEG |
| Sidebar menu icon | `assets/menu/{slug\|home}.jpg` | 40×40 JPEG |

If `home_banner` or `section.banner` is missing in `sections.yaml`, the first upload sets the default path. GitHub Actions rebuilds the public site after each commit.

## Find & replace (all bhajan YAML)

From the **Sections** screen, open **Find & replace (all YAML)**.

1. Enter find / replace text (minimum 2 characters to find).
2. **Preview matches** — scans in batches with a progress bar; **Cancel** stops the search (no commits).
3. **Apply to all matches** — same progress + cancel; each changed file is a separate commit on `main` (cancel does not undo commits already made).

Options: regular expression, case insensitive. Raw file text is updated (YAML structure is preserved if you only change lyrics text).

## URLs and reload

Navigation uses the **hash** in the address bar so reload and back/forward keep context:

| URL hash | Screen |
|----------|--------|
| `#/` | Section picker (home) |
| `#/s/{slug}` | Bhajan list for that section |
| `#/s/{slug}/new` | New bhajan editor |
| `#/edit?p=content/…` | Edit existing file |
| `#/preview?p=content/…` | Publish preview |
| `#/replace` | Find & replace |

Example: `https://your-admin.vercel.app/#/edit?p=content%2Fshiv%2F001-….yaml` reopens that bhajan after refresh.

## Edit screen layout

The edit form uses a **section menu** (left column on wide screens, tabs on phones): **Basic**, **स्थायी**, **Antaras**, **More** (optional shloka / dhvani / jabani), and **Legacy** when applicable. Only one panel is visible at a time; switching sections keeps your in-memory edits until you publish.

## Publish preview

On the edit screen, open **Preview** in the left menu to see the public-site card (same pipeline as `npm run build`: `scripts/lib/bhajan-render.js` → `renderBhajanCard`, plus `site-preview.css`). Use **Refresh preview** after edits on other tabs. **Publish** appears in the bottom bar only on the Preview tab and commits to GitHub.

After changing `assets/css/site.css`, run `npm run admin:preview-css` so the admin preview stays in sync.

## Hindi spell check

### Edit screen (inline)

Red wavy underlines on Hindi fields (Hunspell in the browser; first load ~30–60s).

- **Phone / tablet:** **Long-press** or **select** a flagged word.
- **Desktop:** **Right-click**, **double-click**, or **select** the word.
- Menu: **suggestions**, **Ignore**, **Add to dictionary** (this browser).
- **Publish** warns if flagged words remain.

### Spell errors (all bhajans)

**Sections** → **Spell errors (all bhajans)** (`#/spell-errors`), then **Scan all bhajans**. **Corpus-primary**: every word in published `content/` is valid; then Hindi (`hi_IN`) + word-only Sanskrit (`sanskrit-words.dic`) + `corpus.dic`. Only flags words outside the sangrah with plausible typo suggestions. Regenerate word lists: `npm run build:corpus-dict` and `npm run build:sanskrit-dict` (both run on `npm run build`).

Files: `admin/public/spellcheck.js`, `admin/public/corpus-dictionary.json`, `admin/public/corpus.dic`, `admin/public/sanskrit-words.dic`, `scripts/lib/corpus-dictionary.js`, `scripts/lib/sanskrit-dictionary.js`, `admin/api/spell-fix.js`.

## Voice typing (edit screen)

On phones, the edit screen’s bottom bar has a **mic** button when the browser supports the Web Speech API (Chrome on Android, Safari on iOS 14.5+). Focus a field, tap mic, and dictate in Hindi (`hi-IN`). Tap again to stop. If the mic button is missing, use the **microphone on your Hindi keyboard** (Gboard / iOS).

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

**Immediate fix (no code wait):** Vercel project → **Settings → Git** → **Ignored Build Step** → Custom (with Root Directory `admin`):

```bash
[ "$VERCEL_GIT_COMMIT_REF" = "gh-pages" ]
```

Or for path-based skips: `bash vercel-should-build.sh` (same as `vercel.json`, **not** `bash admin/vercel-should-build.sh`).

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
