# Local Docker container for Secvisogram.
#
# The image tag mirrors docker/build_container.sh: the current git branch
# with slashes replaced by dashes (e.g. main-fork -> secvisogram:main-fork).
# Override any of these on the command line, e.g. `make docker HOST_PORT=9000`.
DOCKER_IMAGE ?= secvisogram
DOCKER_TAG   ?= $(shell git rev-parse --abbrev-ref HEAD | sed 's@/@-@g')
HOST_PORT    ?= 8081

.PHONY: docker docker-build docker-run

## docker: build the image and run it in the foreground (Ctrl-C to stop)
docker: docker-build docker-run

## docker-build: build the local production image from docker/Dockerfile
docker-build:
	docker build -f docker/Dockerfile -t $(DOCKER_IMAGE):$(DOCKER_TAG) .

## docker-run: serve the built image at http://localhost:$(HOST_PORT)
docker-run:
	docker run --rm -p $(HOST_PORT):8080 $(DOCKER_IMAGE):$(DOCKER_TAG)
