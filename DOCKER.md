# Docker images

This fork publishes pre-built images to the GitHub Container Registry so you
can run secvisogram without a local build.

## Image name

```
ghcr.io/tommylehmann/secvisogram
```

Both image flavors share the same package.  Pull the flavor you need by
choosing the right tag (see below).

## Flavors

### `vanilla` — upstream build

Built from the upstream [`secvisogram/secvisogram`](https://github.com/secvisogram/secvisogram)
codebase at an exact upstream `v*` tag.  The build sources are **not modified
by this fork**; the image faithfully represents whatever upstream ships.

The `org.secvisogram.flavor` OCI label is set to `vanilla`.

### `fork` — fork build

Built from this fork's `main-fork` branch at an annotated `kunbus-*` release
tag (e.g. `kunbus-2.6.3.1`).  Includes fork-specific changes (additional CI,
local Docker support, and other fork-only features) that are not part of the
upstream release.

The `org.secvisogram.flavor` OCI label is set to `fork`.

## Tag scheme

| Tag | Flavor | Description |
|-----|--------|-------------|
| `vX.Y.Z` | vanilla | Exact version built from upstream tag `vX.Y.Z` (mirrors the upstream tag name) |
| `vanilla-X.Y.Z` | vanilla | Same image, explicit flavor marker |
| `latest` | vanilla | Points to the highest-semver vanilla image published so far |
| `fork-X.Y.Z.N` | fork | Fork release built from annotated tag `kunbus-X.Y.Z.N` |
| `fork-latest` | fork | Points to the most recently published fork image |

`latest` and `fork-latest` are **mutable** — they move on every new
publication.  For reproducible deployments pin to a versioned tag or a digest:

```sh
# Versioned (immutable content, mutable name on re-publish is not a concern
# because the same versioned tag is never overwritten):
docker pull ghcr.io/tommylehmann/secvisogram:v2.6.4
docker pull ghcr.io/tommylehmann/secvisogram:fork-2.6.3.1

# Digest-pinned (strongest guarantee):
docker pull ghcr.io/tommylehmann/secvisogram@sha256:<digest>
```

## Pulling images

```sh
# Latest vanilla (upstream) image
docker pull ghcr.io/tommylehmann/secvisogram:latest

# Specific upstream release
docker pull ghcr.io/tommylehmann/secvisogram:v2.6.4
docker pull ghcr.io/tommylehmann/secvisogram:vanilla-2.6.4

# Latest fork image
docker pull ghcr.io/tommylehmann/secvisogram:fork-latest

# Specific fork release
docker pull ghcr.io/tommylehmann/secvisogram:fork-2.6.3.1
```

## Identifying the flavor

Every image carries the `org.secvisogram.flavor` OCI label.  You can also tell
the flavors apart from the tag alone: vanilla tags are `vX.Y.Z`, prefixed with
`vanilla-`, or `latest`; fork tags always start with `fork-`.

```sh
docker inspect --format '{{ index .Config.Labels "org.secvisogram.flavor" }}' \
  ghcr.io/tommylehmann/secvisogram:latest
# → vanilla

docker inspect --format '{{ index .Config.Labels "org.secvisogram.flavor" }}' \
  ghcr.io/tommylehmann/secvisogram:fork-latest
# → fork
```

Other useful labels on every image:

| Label | Value |
|-------|-------|
| `org.opencontainers.image.source` | Repository URL |
| `org.opencontainers.image.revision` | Built commit SHA |
| `org.opencontainers.image.version` | Git tag used for the build |
| `org.secvisogram.flavor` | `vanilla` or `fork` |

## Image build

Images are built from the **root `Dockerfile`** at the repo root (the
multi-stage `node:*-alpine` builder → `nginx:alpine` runtime).  The build
context includes `.git` so `git describe` can bake the version into the app's
About dialog and into the CSAF `generator.engine.version` field.

> Note: the legacy `docker/Dockerfile` has been removed from `main-fork`.
> The root `Dockerfile` is the single source of truth for all image builds.

## Sync and trigger model

**Vanilla images** are produced by a scheduled workflow (`docker-vanilla.yml`)
that runs daily from `main-fork`.  It enumerates all upstream `v*` tags, checks
which ones have no image in GHCR yet, and builds only the missing ones.  The
workflow is idempotent: re-running it when all tags are already published is a
no-op.  You can also trigger it manually via `workflow_dispatch` to backfill
specific tags.

**Fork images** are produced by `docker-fork.yml` whenever an annotated
`kunbus-*` tag is pushed to the fork.  The workflow verifies the tag is
annotated (the fork's release convention) before building.

**Upstream mirror sync** is handled by a separate `upstream-sync.yml` workflow
that fast-forwards `origin/main` to `upstream/main` daily.  If `origin/main`
has diverged from `upstream/main` (non-fast-forward situation), the sync makes
no push, fails visibly, and opens a tracking issue — it never force-pushes.

### Divergence behavior

If `upstream/main` and `origin/main` diverge (rare; would require a force-push
at upstream), the sync workflow fails and opens a GitHub issue titled
"upstream/main sync diverged – manual intervention required".  In that case
vanilla images continue to be built from correctly-tagged commits (the tag
itself, not the branch tip), so already-published tags are unaffected.
