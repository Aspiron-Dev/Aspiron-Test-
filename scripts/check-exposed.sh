#!/usr/bin/env bash
# Checks that nothing secret or private is exposed.
#   scripts/check-exposed.sh --local          scan this repository (files that must not be here + secret patterns)
#   scripts/check-exposed.sh [site url]       ask the live website for files that must not be served
#                                             (default: https://aspiron-dev.github.io/Aspiron-Test-)
# Exit code 1 = something to fix. Needs bash, grep, curl. Prints only file names / URLs, never secret values.
set -u
fail=0
bad() { echo "FAIL  $*"; fail=1; }
ok()  { echo "ok    $*"; }

# secret-looking text: Supabase secret / service-role keys, private keys, database URLs with a password, other API tokens
SECRET_RE='sb_secret_[A-Za-z0-9_-]{8}|"role"[[:space:]]*:[[:space:]]*"service_role"|-----BEGIN [A-Z ]*PRIVATE KEY-----|postgres(ql)?://[^[:space:]"'"'"'`<]*:[^@[:space:]"'"'"'`<]{6,}@|gh[pousr]_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|sk_live_[0-9A-Za-z]{10,}|rzp_live_[0-9A-Za-z]{8,}|xox[bpa]-[0-9A-Za-z-]{10,}|VAPID_PRIVATE[[:space:]]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9_-]{30,}'
# a service-role JWT: the middle part (base64) of {"role":"service_role"}
JWT_RE='eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*c2VydmljZV9yb2xl[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+'

if [ "${1:-}" = "--local" ]; then
  cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  files=$(git ls-files 2>/dev/null || find . -type f -not -path './.git/*')
  # files that must never be committed
  for f in $files; do
    case "$f" in
      .env|.env.*|*/.env|*/.env.*) [ "${f##*/}" = ".env.example" ] || bad "committed env file: $f" ;;
      *.pem|*.key|*.p12|*.p8|*.dump|*.dump.gpg|*.backup|*.sql.gz|*.bak|*.map|.DS_Store|*/.DS_Store|service-account*.json|*/service-account*.json) bad "file that must not be committed: $f" ;;
    esac
  done
  # secret patterns in tracked text files (lib/ = exact npm copies)
  hits=$(git grep -lIE "$SECRET_RE|$JWT_RE" -- . ':!lib/*' ':!scripts/check-exposed.sh' 2>/dev/null | grep -v '^BACKUP.md$' || true)
  if [ -n "$hits" ]; then for f in $hits; do bad "secret-looking text in: $f"; done; else ok "no secret-looking text in tracked files"; fi
  # BACKUP.md only shows a placeholder database URL
  if grep -qE 'postgres(ql)?://[^ ]*:[^@ ]{6,}@' BACKUP.md 2>/dev/null && ! grep -qE 'postgres(ql)?://[^ ]*:YOUR-DB-PASSWORD@' BACKUP.md; then bad "BACKUP.md: a database URL that is not the placeholder"; fi
  [ $fail = 0 ] && ok "local check passed"
  exit $fail
fi

BASE="${1:-https://aspiron-dev.github.io/Aspiron-Test-}"; BASE="${BASE%/}"
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$1"; }
for p in .env .env.local .env.production .git/HEAD .git/config .github/workflows/db-backup.yml .DS_Store backup.sql dump.sql db.sql \
         lib/tesseract-5.1.1/tesseract.min.js.map config.js.map app1.js.map store.js.map cx/core.js.map supabase/.temp/project-ref; do
  c=$(code "$BASE/$p")
  if [ "$c" = "200" ]; then bad "served: $BASE/$p"; else ok "$p → $c"; fi
done
# the files the site does serve must not contain secrets
for p in config.js index.html store.html cp-dt764twzf54s5m.html sw.js; do
  body=$(curl -s --max-time 20 "$BASE/$p")
  if [ -z "$body" ]; then echo "warn  could not load $p"; continue; fi
  if printf '%s' "$body" | grep -qE "$SECRET_RE|$JWT_RE"; then bad "secret-looking text served in $p"; else ok "$p has no secret-looking text"; fi
done
# HTTP must redirect to HTTPS
h=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 20 "http://${BASE#https://}/")
case "$h" in 30[1278]\ https://*) ok "http → https ($h)" ;; *) bad "http does not redirect to https ($h)" ;; esac
[ $fail = 0 ] && ok "live check passed"
exit $fail
