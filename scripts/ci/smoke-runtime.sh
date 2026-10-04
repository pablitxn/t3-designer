#!/bin/sh
set -eu
[ "$(id -u)" = 1000 ]
/usr/local/bin/t3-entrypoint nginx -t
/usr/local/bin/t3-entrypoint nginx -g 'daemon off;' &
server_pid=$!
cleanup() {
  kill "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
}
trap cleanup EXIT
ready=false
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if wget -q -O /tmp/t3-health http://127.0.0.1:8080/healthz; then
    ready=true
    break
  fi
  kill -0 "$server_pid"
  sleep 1
done
[ "$ready" = true ]
grep -qx ok /tmp/t3-health
wget -q -O /tmp/t3-index http://127.0.0.1:8080/
grep -q '<div id="root"></div>' /tmp/t3-index
wget -q -O /tmp/t3-privacy http://127.0.0.1:8080/privacy
cmp /tmp/t3-index /tmp/t3-privacy
for path in /app /login /invite /recover; do
  wget -q -O /tmp/t3-spa "http://127.0.0.1:8080$path"
  cmp /tmp/t3-index /tmp/t3-spa
done
wget -q -O /tmp/t3-manifest http://127.0.0.1:8080/models/current/manifest.json
grep -q 'fridge-freezer' /tmp/t3-manifest
wget -q -O /tmp/t3-demo-catalog http://127.0.0.1:8080/demo-assets/catalog.json
grep -q 'dyvlinge-v2' /tmp/t3-demo-catalog
wget -q -O /tmp/t3-demo-model http://127.0.0.1:8080/demo-assets/strandmon-v1/model.glb
[ -s /tmp/t3-demo-model ]
wget -q -O /tmp/t3-demo-preview http://127.0.0.1:8080/demo-assets/strandmon-v1/preview.png
[ -s /tmp/t3-demo-preview ]
for path in /models/missing.glb /demo-assets/missing.glb /demo-assets/strandmon-v1/request.json /umami/api/websites /umami/; do
  if wget -S -O /tmp/t3-response "http://127.0.0.1:8080$path" 2>/tmp/t3-headers; then
    echo "Expected 404 at $path" >&2
    exit 1
  fi
  grep -q '404' /tmp/t3-headers
done
# The generic demo image has neither backend nor analytics upstreams.
for path in /api/me /umami/script.js /umami/api/send; do
  if wget -S -O /tmp/t3-response "http://127.0.0.1:8080$path" 2>/tmp/t3-headers; then
    echo "Expected 404 at $path" >&2; exit 1
  fi
  grep -q '404' /tmp/t3-headers
done
kill -0 "$server_pid"
printf '%s\n' 'Static image smoke passed: nonroot, health, routes, models, gallery; API and analytics disabled.'
