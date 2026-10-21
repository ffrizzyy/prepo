#!/bin/sh
set -eu

# A host volume is mounted over /data as root. Fix ownership once, then drop
# privileges for the process that serves requests and writes recordings.
mkdir -p "$AUDIO_STORAGE_DIR" "$AUDIO_STAGING_DIR"
chown -R node:node /data

exec su-exec node "$@"
