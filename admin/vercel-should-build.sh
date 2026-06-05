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

# Admin API + UI, shared libs, and site CSS used for publish preview
PATTERN='^(admin/|scripts/lib/|assets/css/site\.css)'

matches_admin() {
  grep -qE "$PATTERN" || return 1
}

# List files changed for this deployment (handles merge commits).
changed_files() {
  if [ -n "${VERCEL_GIT_PREVIOUS_SHA:-}" ]; then
    git diff --name-only "$VERCEL_GIT_PREVIOUS_SHA" HEAD 2>/dev/null || true
    return
  fi

  if ! git rev-parse HEAD^1 >/dev/null 2>&1; then
    git show --name-only --pretty=format: HEAD 2>/dev/null || true
    return
  fi

  # Merge: diff against every parent (HEAD^1..HEAD misses changes already on first parent).
  if git rev-parse HEAD^2 >/dev/null 2>&1; then
    {
      git diff --name-only HEAD^1 HEAD
      git diff --name-only HEAD^2 HEAD
    } 2>/dev/null | sort -u
    return
  fi

  git diff --name-only HEAD^1 HEAD 2>/dev/null || true
}

# This commit alone (e.g. spell-allowlist) must build even if last Production was older.
if git rev-parse HEAD^1 >/dev/null 2>&1; then
  commit_files="$(git diff --name-only HEAD^1 HEAD 2>/dev/null || true)"
  if [ -n "$commit_files" ] && echo "$commit_files" | matches_admin; then
    echo "Build: admin-related paths in this commit"
    echo "$commit_files" | grep -E "$PATTERN" || true
    exit 1
  fi
fi

if ! git rev-parse HEAD^1 >/dev/null 2>&1; then
  echo "Build: no parent commit (first deploy or shallow clone)"
  exit 1
fi

all_files="$(changed_files)"
if [ -n "$all_files" ] && echo "$all_files" | matches_admin; then
  echo "Build: admin-related paths changed since last deploy"
  echo "$all_files" | grep -E "$PATTERN" || true
  exit 1
fi

echo "Skip: no admin-related paths in this commit or since ${VERCEL_GIT_PREVIOUS_SHA:-previous deploy}"
echo "Changed files (sample):"
echo "$all_files" | head -20 || true
exit 0
