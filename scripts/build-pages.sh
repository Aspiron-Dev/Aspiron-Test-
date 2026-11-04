#!/usr/bin/env bash
# Build for Cloudflare Pages: copies ONLY the website files into dist/.
# SQL files, docs (.md), tests, scripts, supabase/ and .github/ are never published.
# Cloudflare Pages settings: Build command = bash scripts/build-pages.sh · Build output directory = dist
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist && mkdir dist
find . -type f \( -name '*.html' -o -name '*.js' -o -name '*.css' -o -name '*.png' -o -name '*.webmanifest' -o -name '*.json' \) \
  -not -path './.git/*' -not -path './dist/*' -not -path './tests/*' -not -path './scripts/*' \
  -not -path './supabase/*' -not -path './.github/*' -not -path './.githooks/*' -not -path '*/node_modules/*' \
  -print0 | while IFS= read -r -d '' f; do mkdir -p "dist/$(dirname "$f")"; cp "$f" "dist/$f"; done
cp cloudflare/_headers dist/_headers
# stop if anything private slipped in
if find dist -type f \( -name '*.sql' -o -name '*.md' -o -name '*.sh' -o -name '*.ts' -o -name '*.yml' -o -name '.env*' -o -name '*.map' \) | grep -q .; then
  echo "Build stopped: a private file is in dist/"; exit 1
fi
echo "dist/ ready: $(find dist -type f | wc -l) files"
