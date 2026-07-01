#!/bin/sh
set -eu

case "${1:-web}" in
  web)
    exec node server.js
    ;;
  worker)
    if [ -x ./review-worker ]; then
      exec ./review-worker
    fi
    exec bun worker/review-worker.ts
    ;;
  *)
    exec "$@"
    ;;
esac
