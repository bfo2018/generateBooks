#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.macmini.yml}"
HOST_PORT="${BOOKFORGE_HOST_PORT:-3010}"
RUN_NGROK="${RUN_NGROK:-1}"
FORCE_NGROK_START="${FORCE_NGROK_START:-0}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is not installed or not available in PATH."
  exit 1
fi

if [ "${RUN_NGROK}" = "1" ] && ! command -v ngrok >/dev/null 2>&1; then
  echo "Error: ngrok is not installed or not available in PATH."
  exit 1
fi

if [ ! -f "${ROOT_DIR}/${COMPOSE_FILE}" ]; then
  echo "Error: compose file '${COMPOSE_FILE}' not found in ${ROOT_DIR}."
  exit 1
fi

echo "Stopping existing containers..."
docker compose -f "${ROOT_DIR}/${COMPOSE_FILE}" --project-directory "${ROOT_DIR}" down

echo "Starting containers with fresh build..."
docker compose -f "${ROOT_DIR}/${COMPOSE_FILE}" --project-directory "${ROOT_DIR}" up --build -d

if [ "${RUN_NGROK}" != "1" ]; then
  echo "RUN_NGROK=${RUN_NGROK}. Skipping ngrok start."
  exit 0
fi

if [ "${FORCE_NGROK_START}" != "1" ] && pgrep -f "ngrok.*http" >/dev/null 2>&1; then
  echo "Detected an existing ngrok http process. Leaving it untouched."
  echo "Set FORCE_NGROK_START=1 if you want to start an additional tunnel from this script."
  exit 0
fi

echo "Starting ngrok tunnel for http://localhost:${HOST_PORT} ..."
echo "Press Ctrl+C to stop this ngrok process. Docker containers will keep running."
exec ngrok http "${HOST_PORT}"
