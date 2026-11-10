# Reveal panel plugin - all targets run inside Docker. Nothing here calls npm on the host.
#
#   make build        production build -> ./dist
#   make up           Grafana 13.x at http://localhost:3000 (builds first)
#   make dev          webpack watch + livereload (use in a second terminal next to `make up`)
#   make check        typecheck + lint + unit tests
#   make validate     Grafana plugin-validator against a zip of ./dist
#   make package      ./sparkanswers-reveal-panel-<version>.zip
#   make image        one-image demo: docker build --target runtime -t reveal-grafana .

.RECIPEPREFIX = >
SHELL := /bin/sh

PLUGIN_ID   := sparkanswers-reveal-panel
IMAGE_TAG   ?= reveal-grafana
COMPOSE     ?= docker compose
RUN         := $(COMPOSE) run --rm --no-deps
HOST_UID    := $(shell id -u)
HOST_GID    := $(shell id -g)
# Files written by the root user inside the node containers that should belong to you.
OWNED       := dist coverage .eslintcache .cache package-lock.json out *.zip

.PHONY: help install build test typecheck lint check dev up down logs validate package \
        image run-image dist-export fix-perms clean distclean

help:
> @grep -E '^#   make' $(MAKEFILE_LIST) | sed 's/^#   //'

install:
> $(RUN) install
> @$(MAKE) --no-print-directory fix-perms

build:
> $(RUN) build
> @$(MAKE) --no-print-directory fix-perms

test:
> $(RUN) test
> @$(MAKE) --no-print-directory fix-perms

typecheck:
> $(RUN) typecheck

lint:
> $(RUN) lint
> @$(MAKE) --no-print-directory fix-perms

check: typecheck lint test

dev:
> $(COMPOSE) run --rm --no-deps --service-ports dev

# `grafana` depends_on `build` (service_completed_successfully), so dist is fresh.
up:
> $(COMPOSE) up --build grafana
> @$(MAKE) --no-print-directory fix-perms

down:
> $(COMPOSE) down --remove-orphans

logs:
> $(COMPOSE) logs -f grafana

validate: build
> $(RUN) validate
> @$(MAKE) --no-print-directory fix-perms

package: build
> $(RUN) package
> @$(MAKE) --no-print-directory fix-perms

image:
> docker build --target runtime -t $(IMAGE_TAG) .

run-image: image
> docker run --rm -p 3000:3000 $(IMAGE_TAG)

# Export ./dist from the Docker build itself (no bind mounts, full checks).
dist-export:
> docker build --target dist --output type=local,dest=./out .
> @echo "plugin exported to ./out/dist"

fix-perms:
> @$(RUN) --entrypoint sh build -c 'for f in $(OWNED); do [ -e "$$f" ] && chown -R $(HOST_UID):$(HOST_GID) "$$f"; done; true'

clean:
> $(RUN) --entrypoint sh build -c 'rm -rf dist out coverage .eslintcache .cache $(PLUGIN_ID) $(PLUGIN_ID)-*.zip'

# Also drop the node_modules / npm cache volumes and the Grafana container.
distclean: clean
> $(COMPOSE) down --remove-orphans --volumes
