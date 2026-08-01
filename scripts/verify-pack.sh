#!/usr/bin/env bash
# Verify @umbrelog/sdk tarball contents before npm publish.
# Usage: ./scripts/verify-pack.sh   (from repository root)
set -euo pipefail
cd "$(dirname "$0")/.."

FORBIDDEN='\.env|dev\.db|\.sqlite|test-data|CONFIG\.md|INTERACTIONS\.md|HARDENING\.md|RELEASE_CHECKLIST|/tests/|/src/|/scripts/|/examples/|\.png$|\.jpg$|screenshot'
ALLOWED_TOP='^(package/LICENSE|package/README\.md|package/CHANGELOG\.md|package/package\.json|package/dist/)'

echo "→ npm pack"
TARBALL=$(npm pack 2>/dev/null | tail -1)
echo "  $TARBALL"

echo "→ tar -tf (sorted)"
tar -tf "$TARBALL" | sort

echo "→ forbidden pattern scan"
if tar -tf "$TARBALL" | grep -Ei "$FORBIDDEN"; then
  echo "FAIL: tarball contains forbidden paths (see above)"
  rm -f "$TARBALL"
  exit 1
fi

echo "→ unexpected top-level entries"
BAD=$(tar -tf "$TARBALL" | grep -Ev "$ALLOWED_TOP" || true)
if [ -n "$BAD" ]; then
  echo "$BAD"
  echo "FAIL: unexpected paths outside LICENSE, README, CHANGELOG, package.json, dist/"
  rm -f "$TARBALL"
  exit 1
fi

COUNT=$(tar -tf "$TARBALL" | wc -l | tr -d ' ')
echo "OK: $COUNT files — LICENSE, README, CHANGELOG, package.json, dist/ only"
rm -f "$TARBALL"
