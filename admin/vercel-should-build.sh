#!/usr/bin/env bash
# Vercel Ignored Build Step (repo root). Exit 0 = skip deploy, 1 = build.
# Runs with Vercel Root Directory = admin (cwd is admin/). See admin/README.md.

set -euo pipefail

if [ "${VERCEL_GIT_COMMIT_REF:-}" = "gh-pages" ]; then
  echo "Skip: gh-pages is GitHub Pages only"
  exit 0
fi

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

if ! git rev-parse HEAD^ >/dev/null 2>&1; then
  echo "Build: no parent commit (first deploy or shallow clone)"
  exit 1
fi

# Admin API + UI, shared libs, and site CSS used for publish preview
PATTERN='^(admin/|scripts/lib/|assets/css/site\.css)'
if git diff --name-only HEAD^ HEAD | grep -qE "$PATTERN"; then
  echo "Build: admin-related paths changed"
  exit 1
fi

echo "Skip: no changes under admin/, scripts/lib/, or assets/css/site.css"
exit 0
