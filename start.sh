#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="jobhound"
DATA_DIR="$(pwd)/.data"
CONFIG_FILE="$(pwd)/config.json"
ENV_FILE="$(pwd)/.env"

# Load .env if present
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -o allexport; source "$ENV_FILE"; set +o allexport
else
  echo "Warning: .env not found at $ENV_FILE — continuing without it"
fi

if [[ -z "${IMAGE_TAG:-}" ]]; then
  echo "Error: IMAGE_TAG is not set in .env"
  exit 1
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Error: config.json not found at $CONFIG_FILE"
  echo "Create one based on config.example.json and re-run."
  exit 1
fi

mkdir -p "$DATA_DIR"
cp "$CONFIG_FILE" "$DATA_DIR/config.json"

if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "Stopping and removing existing container: $CONTAINER_NAME"
  docker rm -f "$CONTAINER_NAME"
fi

echo "Starting $CONTAINER_NAME from image $IMAGE_TAG ..."
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart always \
  --init \
  -e TZ=UTC \
  -e DATA_DIR=/app/.data \
  -p 8787:8787 \
  -v "$DATA_DIR:/app/.data" \
  "$IMAGE_TAG"

echo "Container started. Dashboard: http://localhost:8787"
