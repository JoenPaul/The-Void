#!/bin/sh
set -eu

export APP_URL="${RENDER_EXTERNAL_URL:?Missing Render service URL}"
if [ "${PORT:-80}" = 80 ]; then
    export PORT=10000
fi
mkdir -p /tmp/storage/framework/cache/data /tmp/storage/framework/sessions /tmp/storage/framework/views /tmp/storage/logs
php artisan migrate --force
exec frankenphp run --config /etc/caddy/Caddyfile
