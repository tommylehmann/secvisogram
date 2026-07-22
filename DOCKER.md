# Docker images

This fork publishes pre-built **fork** images to the GitHub Container Registry
so you can run secvisogram — with the fork's changes — without a local build.

> Looking for a plain upstream build? Upstream
> [`secvisogram/secvisogram`](https://github.com/secvisogram/secvisogram) now
> publishes its own images; use those for the unmodified upstream app. This
> fork only publishes the `fork` flavor described below.

## Image name

```
ghcr.io/tommylehmann/secvisogram
```

## Flavor

### `fork` — fork build

Built from this fork's `main-fork` branch at an annotated `kunbus-*` release
tag (e.g. `kunbus-2.6.3.1`). Includes fork-specific changes (additional CI,
local Docker support, and other fork-only features) that are not part of the
upstream release.

The `org.secvisogram.flavor` OCI label is set to `fork`.

## Tag scheme

| Tag            | Flavor | Description                                            |
| -------------- | ------ | ------------------------------------------------------ |
| `fork-X.Y.Z.N` | fork   | Fork release built from annotated tag `kunbus-X.Y.Z.N` |
| `fork-latest`  | fork   | Points to the most recently published fork image       |

`fork-latest` is **mutable** — it moves on every new publication. For
reproducible deployments pin to a versioned tag or a digest:

```sh
# Versioned (a given fork-X.Y.Z.N tag is never overwritten):
docker pull ghcr.io/tommylehmann/secvisogram:fork-2.6.3.1

# Digest-pinned (strongest guarantee):
docker pull ghcr.io/tommylehmann/secvisogram@sha256:<digest>
```

## Pulling images

```sh
# Latest fork image
docker pull ghcr.io/tommylehmann/secvisogram:fork-latest

# Specific fork release
docker pull ghcr.io/tommylehmann/secvisogram:fork-2.6.3.1
```

## Identifying the flavor

Every image carries the `org.secvisogram.flavor` OCI label, set to `fork` for
all images this fork publishes. Fork tags always start with `fork-`.

```sh
docker inspect --format '{{ index .Config.Labels "org.secvisogram.flavor" }}' \
  ghcr.io/tommylehmann/secvisogram:fork-latest
# → fork
```

Other useful labels on every image:

| Label                               | Value                      |
| ----------------------------------- | -------------------------- |
| `org.opencontainers.image.source`   | Repository URL             |
| `org.opencontainers.image.revision` | Built commit SHA           |
| `org.opencontainers.image.version`  | Git tag used for the build |
| `org.secvisogram.flavor`            | `fork`                     |

## Image build

Images are built from the **root `Dockerfile`** at the repo root (the
multi-stage `node:*-alpine` builder → `nginx:alpine` runtime). The build
context includes `.git` so `git describe` can bake the version into the app's
About dialog and into the CSAF `generator.engine.version` field.

> Note: the legacy `docker/Dockerfile` has been removed from `main-fork`.
> The root `Dockerfile` is the single source of truth for all image builds.

## Sync and trigger model

**Fork images** are produced by `docker-fork.yml` whenever an annotated
`kunbus-*` tag is pushed to the fork. The workflow verifies the tag is
annotated (the fork's release convention) before building.

**Upstream mirror sync** is handled by a separate `upstream-sync.yml` workflow
that fast-forwards `origin/main` to `upstream/main` daily. If `origin/main`
has diverged from `upstream/main` (non-fast-forward situation), the sync makes
no push, fails visibly, and opens a tracking issue — it never force-pushes.

### Divergence behavior

If `upstream/main` and `origin/main` diverge (rare; would require a force-push
at upstream), the sync workflow fails and opens a GitHub issue titled
"upstream/main sync diverged – manual intervention required" for manual
resolution.
