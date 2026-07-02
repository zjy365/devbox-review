#!/bin/sh
set -eu

case "${1:-app}" in
  app)
    exec node server.js
    ;;
  *)
    exec "$@"
    ;;
esac
