#!/usr/bin/env bash
# list-missing-vanilla-tags.sh
#
# Emits a JSON matrix of upstream stable v* tags that have no corresponding
# vanilla image in GHCR.  Also determines which tag is the newest semver so
# the caller can decide whether to push :latest.
#
# Floor / backfill rule (spec "Out of scope"):
#   DEFAULT (scheduled / unattended) run:
#     - If GHCR already has at least one vanilla image (vX.Y.Z / vanilla-X.Y.Z /
#       bare X.Y.Z), build only the upstream stable v* tags that are strictly
#       newer (by semver) than the highest already-published vanilla tag.
#     - If GHCR has NO vanilla images yet (first ever run), build only the
#       single newest stable upstream tag.
#   MANUAL run (MANUAL_TAGS non-empty):
#     - Build exactly the listed tags (after validating they exist upstream).
#     - Manual tags can name older or pre-release tags but NEVER move :latest.
#
# Stable tags only: vX.Y.Z with no pre-release suffix.  Tags like v2.7.0-rc.1
# are excluded from default discovery and can never become :latest.
#
# C9: On any real error querying GHCR (non-404), the script exits non-zero so
#     the discovery job fails closed (no matrix emitted → no build).
# C3: Called from a workflow step with values passed via env, never via ${{ }}.

set -euo pipefail

UPSTREAM_REPO="https://github.com/secvisogram/secvisogram.git"
IMAGE_OWNER="${REPO_OWNER:-tommylehmann}"
IMAGE_NAME="ghcr.io/${IMAGE_OWNER}/secvisogram"

# ── 1. Fetch upstream stable v* tags ─────────────────────────────────────────
echo "Fetching upstream tags from ${UPSTREAM_REPO}..." >&2
# F3: append || true so an empty grep result yields "" rather than aborting
# the script under set -euo pipefail before we can handle the empty case.
# Stable-only filter (F4): require full vX.Y.Z with no additional characters
# (anchored with $) to exclude pre-release suffixes like -rc.1 or -beta.
UPSTREAM_TAGS=$(git ls-remote --tags --refs "$UPSTREAM_REPO" 'refs/tags/v*' \
  | awk '{print $2}' \
  | sed 's|refs/tags/||' \
  | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' \
  | sort -V \
  || true)

if [ -z "$UPSTREAM_TAGS" ]; then
  echo "::warning::No upstream stable v* tags found – emitting empty matrix." >&2
  echo '{"include":[]}'
  exit 0
fi

echo "Upstream stable tags found: $(echo "$UPSTREAM_TAGS" | tr '\n' ' ')" >&2

# ── 2. Query existing GHCR tags (source of truth for published state) ─────────
# C9: Any real error here must propagate – do NOT treat an empty/failed
# response as "nothing published".  A 404 specifically means the package does
# not yet exist (first-ever run) and is treated as an empty published set so
# the first image can be built.  Any other non-200 status is a hard failure.

echo "Querying existing GHCR tags for ${IMAGE_NAME}..." >&2

# F2: Capture HTTP status explicitly; do NOT use --fail so we can distinguish
# 404 ("package does not exist yet") from other errors.
TOKEN_BODY=$(mktemp)
TOKEN_STATUS=$(curl -s \
  -o "${TOKEN_BODY}" \
  -w '%{http_code}' \
  -u "${GITHUB_ACTOR:-}:${GITHUB_TOKEN}" \
  "https://ghcr.io/token?scope=repository:${IMAGE_OWNER}/secvisogram:pull&service=ghcr.io")

if [ "${TOKEN_STATUS}" = "404" ]; then
  echo "GHCR package not yet created (token endpoint 404) – treating as first run with no published tags." >&2
  GHCR_TAGS=""
elif [ "${TOKEN_STATUS}" != "200" ]; then
  echo "::error::GHCR token exchange failed with HTTP ${TOKEN_STATUS} – failing closed (C9)." >&2
  exit 1
else
  BEARER=$(python3 -c "import sys,json; print(json.load(open('${TOKEN_BODY}'))['token'])")

  # Fetch all tags (paginate if >100; GHCR supports Link header pagination).
  GHCR_TAGS=""
  NEXT_URL="https://ghcr.io/v2/${IMAGE_OWNER}/secvisogram/tags/list"
  HEADERS_FILE=$(mktemp)
  while [ -n "$NEXT_URL" ]; do
    TAGS_BODY=$(mktemp)
    TAGS_STATUS=$(curl -s \
      -o "${TAGS_BODY}" \
      -w '%{http_code}' \
      --dump-header "${HEADERS_FILE}" \
      -H "Authorization: Bearer ${BEARER}" \
      "$NEXT_URL")

    if [ "${TAGS_STATUS}" = "404" ]; then
      # Package exists (we got a token) but has no tags yet – treat as empty.
      echo "GHCR tags endpoint returned 404 – package has no tags yet." >&2
      break
    elif [ "${TAGS_STATUS}" != "200" ]; then
      echo "::error::GHCR tags query failed with HTTP ${TAGS_STATUS} – failing closed (C9)." >&2
      exit 1
    fi

    PAGE_TAGS=$(python3 -c "
import sys, json
with open('${TAGS_BODY}') as f:
    tags = json.load(f).get('tags', [])
for t in tags:
    print(t)
" 2>/dev/null || true)
    GHCR_TAGS="${GHCR_TAGS}${PAGE_TAGS}"$'\n'
    LINK=$(grep -i '^link:' "${HEADERS_FILE}" | grep 'rel="next"' | sed 's/.*<\(.*\)>.*/\1/' || true)
    NEXT_URL="$LINK"
  done
fi

echo "Published GHCR tags: $(echo "$GHCR_TAGS" | grep -c . || true) tags found" >&2

# ── 3. Determine the floor for default (non-manual) runs ─────────────────────
# If the caller supplied MANUAL_TAGS we skip floor logic entirely.
if [ -n "${MANUAL_TAGS:-}" ]; then
  echo "Manual override – building only: ${MANUAL_TAGS}" >&2
  # Split comma/space-separated list; keep only stable v* tags that exist upstream.
  CANDIDATE_TAGS=$(echo "$MANUAL_TAGS" | tr ',' '\n' | tr ' ' '\n' \
    | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+' \
    | grep -Fxf <(echo "$UPSTREAM_TAGS") \
    || true)
  if [ -z "$CANDIDATE_TAGS" ]; then
    echo "::warning::None of the manual tags exist as upstream stable v* tags – empty matrix." >&2
    echo '{"include":[]}'
    exit 0
  fi
  IS_MANUAL=1
else
  IS_MANUAL=0
  # Compute the highest already-published vanilla tag (X.Y.Z or vanilla-X.Y.Z).
  # Map published tags back to the vX.Y.Z form for version comparison.
  HIGHEST_PUBLISHED=""
  while IFS= read -r ptag; do
    [ -z "$ptag" ] && continue
    # Accept "vX.Y.Z" (the published scheme), "vanilla-X.Y.Z", or a bare
    # "X.Y.Z" as evidence of publication. vX.Y.Z mirrors the upstream tag name.
    if echo "$ptag" | grep -qE '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
      vform="$ptag"
    elif echo "$ptag" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
      vform="v${ptag}"
    elif echo "$ptag" | grep -qE '^vanilla-[0-9]+\.[0-9]+\.[0-9]+$'; then
      vform="v${ptag#vanilla-}"
    else
      continue
    fi
    # Keep the highest published stable vX.Y.Z.
    if [ -z "$HIGHEST_PUBLISHED" ]; then
      HIGHEST_PUBLISHED="$vform"
    else
      # sort -V: the last entry is the newer one
      HIGHEST_PUBLISHED=$(printf '%s\n%s\n' "$HIGHEST_PUBLISHED" "$vform" | sort -V | tail -1)
    fi
  done <<< "$GHCR_TAGS"

  if [ -z "$HIGHEST_PUBLISHED" ]; then
    # First-ever run: no vanilla image exists yet.
    # F1: build only the single newest stable upstream tag, not the whole history.
    echo "No vanilla images published yet – first run: will build newest stable tag only." >&2
    NEWEST_UPSTREAM=$(echo "$UPSTREAM_TAGS" | sort -V | tail -1)
    CANDIDATE_TAGS="$NEWEST_UPSTREAM"
  else
    echo "Highest published vanilla tag: ${HIGHEST_PUBLISHED}" >&2
    # Keep only upstream tags that are strictly newer than HIGHEST_PUBLISHED.
    CANDIDATE_TAGS=$(echo "$UPSTREAM_TAGS" \
      | while IFS= read -r vtag; do
          cmp=$(printf '%s\n%s\n' "$HIGHEST_PUBLISHED" "$vtag" | sort -V | tail -1)
          if [ "$cmp" = "$vtag" ] && [ "$vtag" != "$HIGHEST_PUBLISHED" ]; then
            echo "$vtag"
          fi
        done \
      || true)
    if [ -z "$CANDIDATE_TAGS" ]; then
      echo "No upstream tags newer than ${HIGHEST_PUBLISHED} – emitting empty matrix." >&2
      echo '{"include":[]}'
      exit 0
    fi
    echo "Candidate tags (newer than floor): $(echo "$CANDIDATE_TAGS" | tr '\n' ' ')" >&2
  fi
fi

# ── 4. Compute missing tags ───────────────────────────────────────────────────
# A vanilla tag vX.Y.Z is considered published if vX.Y.Z (the published scheme),
# vanilla-X.Y.Z, or a bare X.Y.Z already exists in GHCR.
MISSING_TAGS=""
while IFS= read -r vtag; do
  [ -z "$vtag" ] && continue
  version="${vtag#v}"
  if echo "$GHCR_TAGS" | grep -qxF "v${version}" || \
     echo "$GHCR_TAGS" | grep -qxF "vanilla-${version}" || \
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

# ── 5. Determine newest STABLE upstream tag (for :latest promotion) ───────────
# F4: :latest is only promoted for the single newest stable tag; manual runs
# (IS_MANUAL=1) never move :latest regardless of what tag they build.
NEWEST_UPSTREAM=$(echo "$UPSTREAM_TAGS" | sort -V | tail -1)
echo "Newest upstream stable tag: ${NEWEST_UPSTREAM}" >&2

# ── 6. Emit JSON matrix ───────────────────────────────────────────────────────
export MISSING_TAGS_RAW="$MISSING_TAGS"
export NEWEST_TAG="$NEWEST_UPSTREAM"
export IS_MANUAL_RUN="$IS_MANUAL"
# IMAGE_OWNER is already in the environment from the caller or the default above.

python3 - <<'PYEOF'
import os, sys, json

missing_raw = os.environ.get("MISSING_TAGS_RAW", "")
newest = os.environ.get("NEWEST_TAG", "")
is_manual = os.environ.get("IS_MANUAL_RUN", "0") == "1"
image_owner = os.environ.get("IMAGE_OWNER", "tommylehmann")
image = f"ghcr.io/{image_owner}/secvisogram"

items = []
for line in missing_raw.strip().splitlines():
    vtag = line.strip()
    if not vtag:
        continue
    # F6: use removeprefix (Python 3.9+) for parity with bash ${vtag#v} — strips
    # exactly one 'v' prefix, not a character class.
    version = vtag.removeprefix("v")
    # F4 / F5: :latest only moves when building the true newest stable upstream
    # tag in an unattended (non-manual) run.
    push_latest = (not is_manual) and (vtag == newest)
    # Vanilla scheme: :vX.Y.Z (mirrors the upstream tag name) + :vanilla-X.Y.Z
    # (explicit flavor marker). :latest only for the newest stable (below).
    tags_list = [
        f"{image}:v{version}",
        f"{image}:vanilla-{version}",
    ]
    if push_latest:
        tags_list.append(f"{image}:latest")
    items.append({
        "tag": vtag,
        "version": version,
        "tags": "\n".join(tags_list),
    })

print(json.dumps({"include": items}))
PYEOF
