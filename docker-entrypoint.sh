#!/bin/sh
set -e

mkdir -p /app/data/disclosures /app/data/rag /app/data/cvm-raw

if [ "$(id -u)" = "0" ]; then
  chown -R nextjs:nodejs /app/data
  exec su-exec nextjs "$@"
fi

exec "$@"
