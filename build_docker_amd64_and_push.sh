#!/usr/bin/env bash

set -euo pipefail

BUILDER_NAME="${BUILDER_NAME:-mybuilder}"
IMAGE_NAME="${IMAGE_NAME:-reg.callfry.com/sound-synthesis/sound-synthesis:latest}"

if ! docker buildx inspect "$BUILDER_NAME" >/dev/null 2>&1; then
  docker buildx create --use --name "$BUILDER_NAME"
else
  docker buildx use "$BUILDER_NAME"
fi

docker buildx inspect "$BUILDER_NAME" --bootstrap

docker buildx build --platform linux/amd64 -t "$IMAGE_NAME" --push .
