#!/usr/bin/env bash
# list-missing-vanilla-tags.sh
#
# Emits a JSON matrix of upstream v* tags that have no corresponding vanilla
# image in GHCR.  Also determines which tag is the newest semver so the caller
# can decide whether to push :latest.
#
# Usage: GITHUB_TOKEN=<token> REPO_OWNER=<owner> [MANUAL_TAGS=<csv>] ./list-missing-vanilla-tags.sh
#
# Outputs (to stdout, JSON):
#   {"include": [{"tag": "vX.Y.Z", "version": "X.Y.Z", "push_latest": true|false}, ...]}
#
# C9: On any error querying GHCR, the script exits non-zero so the discovery
# job fails closed (no matrix emitted → no build).
#
# C3: Called from a workflow step with values passed via env, never via ${{ }}.

set -euo pipefail

UPSTREAM_REPO="https://github.com/secvisogram/secvisogram.git"
IMAGE_OWNER="${REPO_OWNER:-tommylehmann}"
IMAGE_NAME="ghcr.io/${IMAGE_OWNER}/secvisogram"

# ── 1. Fetch upstream v* tags ────────────────────────────────────────────────
echo "Fetching upstream tags from ${UPSTREAM_REPO}..." >&2
UPSTREAM_TAGS=$(git ls-remote --tags --refs "$UPSTREAM_REPO" 'refs/tags/v*' \
  | awk '{print $2}' \
  | sed 's|refs/tags/||' \
  | grep -E '^v[0-9]+\.[0-9]+\.[0-9]' \
  | sort -V)

if [ -z "$UPSTREAM_TAGS" ]; then
  echo "::warning::No upstream v* tags found – emitting empty matrix." >&2
  echo '{"include":[]}'
  exit 0
fi

echo "Upstream tags found: $(echo "$UPSTREAM_TAGS" | tr '\n' ' ')" >&2

# If the workflow was dispatched with an explicit tag list, use only those.
if [ -n "${MANUAL_TAGS:-}" ]; then
  echo "Manual override – building only: ${MANUAL_TAGS}" >&2
  # Split comma/space-separated list; keep only valid v* tags that exist upstream.
  CANDIDATE_TAGS=$(echo "$MANUAL_TAGS" | tr ',' '\n' | tr ' ' '\n' | grep -E '^v[0-9]' | grep -Fxf <(echo "$UPSTREAM_TAGS") || true)
  if [ -z "$CANDIDATE_TAGS" ]; then
    echo "::warning::None of the manual tags exist as upstream v* tags – empty matrix." >&2
    echo '{"include":[]}'
    exit 0
  fi
else
  CANDIDATE_TAGS="$UPSTREAM_TAGS"
fi

# ── 2. Query existing GHCR tags (source of truth for published state) ────────
# C9: Any error here must propagate (set -e) – do not treat an empty/failed
# response as "nothing published".
echo "Querying existing GHCR tags for ${IMAGE_NAME}..." >&2

# Use the GHCR container registry API via the Docker v2 catalog / tags endpoint.
# Token exchange: GITHUB_TOKEN → bearer token for ghcr.io.
AUTH_RESPONSE=$(curl --fail --silent \
  -u "${GITHUB_ACTOR:-}:${GITHUB_TOKEN}" \
  "https://ghcr.io/token?scope=repository:${IMAGE_OWNER}/secvisogram:pull&service=ghcr.io")

BEARER=$(echo "$AUTH_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# Fetch all tags (paginate if >100; GHCR supports Link header pagination).
GHCR_TAGS=""
NEXT_URL="https://ghcr.io/v2/${IMAGE_OWNER}/secvisogram/tags/list"
while [ -n "$NEXT_URL" ]; do
  RESPONSE=$(curl --fail --silent --dump-header /tmp/ghcr_headers.txt \
    -H "Authorization: Bearer ${BEARER}" \
    "$NEXT_URL")
  PAGE_TAGS=$(echo "$RESPONSE" | python3 -c "import sys,json; tags=json.load(sys.stdin).get('tags',[]); [print(t) for t in tags]" 2>/dev/null || true)
  GHCR_TAGS="${GHCR_TAGS}${PAGE_TAGS}"$'\n'
  LINK=$(grep -i '^link:' /tmp/ghcr_headers.txt | grep 'rel="next"' | sed 's/.*<\(.*\)>.*/\1/' || true)
  NEXT_URL="$LINK"
done

echo "Published GHCR tags (sample): $(echo "$GHCR_TAGS" | grep -c . || true) tags found" >&2

# ── 3. Compute missing tags ──────────────────────────────────────────────────
# A vanilla tag vX.Y.Z is considered published if vanilla-X.Y.Z (or X.Y.Z)
# already exists in GHCR.
MISSING_TAGS=""
while IFS= read -r vtag; do
  [ -z "$vtag" ] && continue
  version="${vtag#v}"  # strip leading 'v'
  if echo "$GHCR_TAGS" | grep -qxF "vanilla-${version}" || \
     echo "$GHCR_TAGS" | grep -qxF "${version}"; then
    echo "  ${vtag} already published – skipping." >&2
  else
    echo "  ${vtag} missing – will build." >&2
    MISSING_TAGS="${MISSING_TAGS}${vtag}"$'\n'
  fi
done <<< "$CANDIDATE_TAGS"

if [ -z "${MISSING_TAGS// }" ]; then
  echo "All candidate tags are already published – empty matrix." >&2
  echo '{"include":[]}'
  exit 0
fi

# ── 4. Determine newest semver tag (for :latest promotion) ──────────────────
NEWEST_UPSTREAM=$(echo "$UPSTREAM_TAGS" | sort -V | tail -1)
echo "Newest upstream tag: ${NEWEST_UPSTREAM}" >&2

# ── 5. Emit JSON matrix ──────────────────────────────────────────────────────
export MISSING_TAGS_RAW="$MISSING_TAGS"
export NEWEST_TAG="$NEWEST_UPSTREAM"
# IMAGE_OWNER is already in the environment from the caller or the default above.

python3 - <<'PYEOF'
import os, sys, json

missing_raw = os.environ.get("MISSING_TAGS_RAW", "")
newest = os.environ.get("NEWEST_TAG", "")
image_owner = os.environ.get("IMAGE_OWNER", "tommylehmann")
image = f"ghcr.io/{image_owner}/secvisogram"

items = []
for line in missing_raw.strip().splitlines():
    vtag = line.strip()
    if not vtag:
        continue
    version = vtag.lstrip("v")
    push_latest = (vtag == newest)
    tags_list = [
        f"{image}:{version}",
        f"{image}:vanilla-{version}",
    ]
    if push_latest:
        tags_list.append(f"{image}:latest")
    items.append({
        "tag": vtag,
        "version": version,
        "push_latest": push_latest,
        "tags": "\n".join(tags_list),
    })

print(json.dumps({"include": items}))
PYEOF
