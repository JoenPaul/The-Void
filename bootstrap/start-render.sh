#!/bin/sh
set -eu

export APP_URL="${RENDER_EXTERNAL_URL:?Missing Render service URL}"
mkdir -p /tmp/storage/framework/cache/data /tmp/storage/framework/sessions /tmp/storage/framework/views /tmp/storage/logs
php artisan migrate --force
exec frankenphp run --config /etc/caddy/Caddyfile
