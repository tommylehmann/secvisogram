# Local Docker container for Secvisogram.
#
# The image tag is derived from the current git branch with slashes
# replaced by dashes (e.g. main-fork -> secvisogram:main-fork).
# Override any of these on the command line, e.g. `make docker HOST_PORT=9000`.
DOCKER_IMAGE ?= secvisogram
DOCKER_TAG   ?= $(shell git rev-parse --abbrev-ref HEAD | sed 's@/@-@g')
HOST_PORT    ?= 8081

.PHONY: docker docker-build docker-run

## docker: build the image and run it in the foreground (Ctrl-C to stop)
docker: docker-build docker-run

## docker-build: build the local production image from the root Dockerfile
docker-build:
	docker build -f Dockerfile -t $(DOCKER_IMAGE):$(DOCKER_TAG) .

## docker-run: serve the built image at http://localhost:$(HOST_PORT)
docker-run:
	docker run --rm -p $(HOST_PORT):80 $(DOCKER_IMAGE):$(DOCKER_TAG)
