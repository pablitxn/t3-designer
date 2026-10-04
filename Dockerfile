# A complete static demo is the default; WEB_MODE=full adds the optional account UI.
ARG NODE_IMAGE=node:24-bookworm@sha256:5a750d3be5e5c80275f8c9a5367c3aed99c2875656590c8d0701c7ee687f5f0a
ARG NGINX_IMAGE=nginx:1.30.5-alpine@sha256:8f84ed99befc3891b8f329c5c202785278a2cfb7c25107d57fb2a134a3117433
FROM ${NODE_IMAGE} AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@12.7.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile --ignore-scripts
ARG WEB_MODE=demo
RUN case "$WEB_MODE" in demo|full) ;; *) exit 1 ;; esac \
    && pnpm --filter @t3-designer/web exec vite build --mode "$WEB_MODE"

FROM ${NGINX_IMAGE}
ARG OCI_REVISION=dev
ARG OCI_SOURCE=""
LABEL org.opencontainers.image.title="T3 Designer" \
      org.opencontainers.image.source="${OCI_SOURCE}" \
      org.opencontainers.image.revision="${OCI_REVISION}"

COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/entrypoint.sh /usr/local/bin/t3-entrypoint
COPY docker/api-location.conf.template /etc/t3/api-location.conf.template
COPY scripts/ci/smoke-runtime.sh /app/scripts/ci/smoke-runtime.sh
RUN mkdir -p /etc/nginx/t3-http.d /etc/nginx/t3-server.d \
    && chmod 755 /usr/local/bin/t3-entrypoint \
    && test -s /etc/ssl/certs/ca-certificates.crt
COPY --from=build --chown=1000:1000 /app/apps/web/dist/ /usr/share/nginx/html/

USER 1000:1000
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["/usr/local/bin/t3-entrypoint"]
CMD ["nginx", "-g", "daemon off;"]
