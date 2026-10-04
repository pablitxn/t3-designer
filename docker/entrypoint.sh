#!/bin/sh
set -eu
umask 077
if [ -n "${T3_API_UPSTREAM:-}" ]; then
  # An operator-controlled authority only: never interpolate Nginx directives.
  case "$T3_API_UPSTREAM" in
    *[!a-zA-Z0-9._:-]*) echo 'T3_API_UPSTREAM contains invalid characters' >&2; exit 1 ;;
  esac
  printf '%s' "$T3_API_UPSTREAM" | grep -Eq '^[a-zA-Z0-9][a-zA-Z0-9._-]*:[0-9]{1,5}$' || {
    echo 'T3_API_UPSTREAM must be a hostname:port authority' >&2; exit 1;
  }
  upstream_port=${T3_API_UPSTREAM##*:}
  [ "$upstream_port" -ge 1 ] && [ "$upstream_port" -le 65535 ] || {
    echo 'T3_API_UPSTREAM port must be between 1 and 65535' >&2; exit 1;
  }
  export T3_API_UPSTREAM
  envsubst '${T3_API_UPSTREAM}' < /etc/t3/api-location.conf.template > /tmp/t3-api.conf
else
  printf '%s\n' 'location = /api { return 404; }' 'location ^~ /api/ { add_header Cache-Control "private, no-store" always; return 404; }' > /tmp/t3-api.conf
fi
exec "$@"
