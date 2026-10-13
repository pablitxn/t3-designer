# T3 — integracion QA de cinco roles (2026-10-13)

Estado: DRAFT, verificacion de matrices y CI en curso. No aprobado para merge/deploy. Este reporte reemplaza el estado transversal; los informes fuente conservan evidencia historica de sus propias ramas.

Base `origin/main`: `7a851eb7ab703016d78c102afeaac2a8d97b08f3`. Rama de trabajo `qa/t3-integration-20261013`. Corte de codigo con check completo y seis nuevas regresiones Chromium PASS: `e4cb70fed850f5460b8a116e1e62177869fc9d9c`. [Proveniencia completa](sources.json).

| Rol | PR fuente | SHA verificado |
| --- | --- | --- |
| Anonimo | [PR3](https://github.com/pablitxn/t3-designer/pull/3) | `cf8fc398aa0d4d3f23a3bf5773296d2a502734be` |
| Admin global | [PR4](https://github.com/pablitxn/t3-designer/pull/4) | `07d9c16e7707ed10cfdae3f592030ba27f76aa94` |
| Propietario | [PR5](https://github.com/pablitxn/t3-designer/pull/5) | `bc01ee5b98f858784353d533ac957944706af199` |
| Editor compartido | [PR6](https://github.com/pablitxn/t3-designer/pull/6) | `7fe34e94419fe4c074937072dc55f85d5b216f3e` |
| Viewer | [PR7](https://github.com/pablitxn/t3-designer/pull/7) | `85d2374363ed94242f24fb2c6cfc262c94ce355c` |

Se integraron los arboles finales mediante un squash por rol, con commits independientes. Las cinco ramas y PRs originales permanecen intactos y abiertos. No se incluyo como ancestro el historial de borradores de editor, que falla el gate de privacidad. No se reescribio ningun historial ni se debilito el auditor. No hubo merge en main ni deploy.

## Resolucion semantica

- `App.tsx` consulta un solo evento cancelable `t3:before-navigate` antes de actualizar una ruta de history. El editor usa ese mismo guard para links y logout; se conserva URL completa al cancelar. Se retira la alternativa duplicada de owner y se preservan ambas regresiones.
- `PrivateApp.tsx` combina limpieza inmediata ante 403/404, rechazo de respuestas abortadas/guardados tardios y checks de sesion por secuencia/epoch. Un 401 tardio revalida la cookie actual y no expulsa otra identidad valida. El editor/viewer revalida membresia al focus, visibilitychange y cada 60 s visible. Una revision nueva conserva borrador dirty hasta resolver 409; un cambio de rol retira controles y borrador no autorizado. Misma revision/rol conserva selectores temporales del viewer.
- Los sliders conservan una sola asociacion label/input por ID; el overlay del paseo tiene un unico z-index sobre el minimapa. Los nombres largos no imponen ancho minimo al aside.
- Todos los configs Playwright entran en typecheck. Los suites con backend propio se ejecutan por gates dedicados; no se descubren de nuevo bajo el servidor generico. `check:all` conserva gates anteriores y suma los cinco roles. CI GitHub/GitLab incorpora Chromium para los suites nuevos; WebKit sigue fuera de ejecucion por bloqueo conocido del environment.
- Cada fixture/Vite usa cache propio para no invalidar otra sesion. Owner utiliza el Chromium oficial instalado por Playwright salvo override explicito del Cloud. Sus mocks mantienen las restricciones development/loopback/carpeta aislada y no se conectan a proveedores.

Archivos compartidos a revisar: `App.tsx`, `private/PrivateApp.tsx`, `walkthrough/Walkthrough.tsx`, `styles/walkthrough.css`, `private/AccountHub.tsx`, `private/account-copy.ts`, `components/AssetsExplorer.tsx`, `lib/asset-api.ts`, `accounts.ts`, package scripts, tsconfig, configs Playwright/Vite y workflows CI. Las diferencias de producto son focalizadas; no hay protocolo nuevo ni refactor de arquitectura.

## Diagnostico de gates fuente

La base pasa `audit:history` (785 blobs, 8 commits). Anonimo, admin, owner y viewer pasan sus auditorias de historial fuente. Editor falla por `personal home directory` en un blob historico de `docs/qa/shared-project-editor-2026-10-13.md`; el informe final ya habia retirado la ruta pero el ancestro seguia alcanzable. La integracion inicial de cinco tips pasa 852 blobs/13 commits. Auditoria sobre revision final pendiente.

El SHA original de viewer se reprodujo en un worktree detached: lint/tipos/tests de paquetes pasan, pero el test de links documentales rechaza dos enlaces relativos a artifacts ignorados ausentes. El primer check integrado reproduce esos dos mas cuatro de editor. Se convierten a referencias textuales locales; el gate queda intacto. `pnpm check` integrado pasa: 658 Node + 35 Python, lint, tipos, scene snapshot en lectura, build demo y auditoria de 696 archivos. Build full y auditoria pasan 728 archivos. Los logs remotos de los fallos fuente devolvieron 403; estas causas estan respaldadas por reproduccion local, no por un log remoto descargado.

Owner rechazó primero `artifacts/integration-qa/owner` como ruta de datos: es una proteccion deliberada. La ejecucion correcta usa `artifacts/owner-qa/integration-20261013`; no se amplio el allowlist.

## Evidencia y alcance

Matrices de integracion en curso; no trasladar PASS de los informes originales a este checkout. Evidencia local: `artifacts/integration-qa/`, `artifacts/owner-qa/integration-20261013/`, `artifacts/qa-global-admin/`. DB y session-secret son fixtures locales ignorados; no se incluyen en entregables publicos. Las capturas/trazas locales no estan publicadas en Git.

Chromium de sistema 154.0.8037.57, Playwright y viewports exactos en cada JSON/browser-context/trace. Emulacion touch: anonimo 320x568 y 430x932; admin 320x740 y 430x932; owner/editor 360x800 y 430x932; viewer 375x812 y 430x932. Desktop 1440x1000. WebGL usa software SwiftShader y assets existentes. No se acredita calidad 3D ni dispositivo fisico.

WebKit: BLOCKED por descarga 403 conocida, sin reintento de allowlists ni permisos. Safari, Firefox, telefonos fisicos, PostgreSQL, GPU fisica, correos, pagos/proveedores reales, Blender/modelado/render y produccion: NOT RUN. Sin inferencia externa ni solicitudes OpenAI/Codex. No se afirma cobertura absoluta.

## Reproducir y revisar manualmente

Instalar Node 24/pnpm 12.7 y `pnpm install --frozen-lockfile --ignore-scripts`. En este Cloud, primero `source /workspace/.cloud-setup/activate.sh`. Para otro host, instalar Chromium con Playwright y omitir overrides del sistema. Usar perfiles de navegador independientes y directorios nuevos; no cargar `.env` productivo.

- Anonimo: `node scripts/qa-anonymous.mjs`, puerto 4190. Recorrer tabs, ajustes/reload, dossier/cierre con foco, galeria/version/imagen retry, slider/paseo. [Guia fuente](../../workflows/anonymous-qa.md).
- Admin: `pnpm qa:admin`, launcher con datos ficticios y billing mock. Validar motivo corto, invitaciones/cupo, suspension permitida, compra mock/reload, consumo y cuenta ajena. [Guia fuente](../2026-10-13-global-admin.md).
- Owner: dos terminales segun [guia](../owner-20261013.md), backend explicito `NODE_ENV=development T3_OWNER_QA=isolated-fixtures T3_QA_DIRECTORY=artifacts/owner-qa/manual-integrated node apps/api/test/owner-qa-backend.ts` con claves/proveedores/database/telemetry externos ausentes; web full en 4189 con proxy 8798. Tomar solo cuentas/password ficticios del seed local. Crear proyecto/intake, adjuntar archivo, guardar, cancelar Atrás con borrador, resolver conflicto, preguntas/correcciones/aceptacion, retry/cancel y descarga mock. No usar esos archivos como datos productivos.
- Viewer/editor: escenario `node scripts/qa/project-viewer-scenario.mjs` segun [guia viewer](../project-viewer-2026-10-13.md). El owner comparte desde una sesion independiente como viewer/editor. Verificar lectura sin controles de escritura; editor cambia notas y guarda. Con borrador dirty, cancelar link/Atrás mantiene URL y texto. Quitar acceso/cambiar rol desde owner, volver al focus: desaparecen controles/datos no autorizados. Logout/nuevo login no recupera datos de otra cuenta. [Guia editor](../shared-project-editor-2026-10-13.md).

Detener solamente los procesos propios con Ctrl-C. Para desactivar los mocks de generacion, detener el backend QA y arrancar el entry point normal `apps/api/src/index.ts` con datos aislados y `T3_GENERATION_ENABLED=false`. Los mocks no forman parte del arranque normal de produccion; fallan cerrados ante NODE_ENV production o ruta/origin no permitidos.

## Predocumentacion para Atlas

Cinco fichas **pendientes de consolidacion**: [anonimo](predocumentation/T3-QA-20261013-ANONYMOUS.md), [admin](predocumentation/T3-QA-20261013-GLOBAL-ADMIN.md), [owner](predocumentation/T3-QA-20261013-PROJECT-OWNER.md), [editor](predocumentation/T3-QA-20261013-SHARED-EDITOR.md), [viewer](predocumentation/T3-QA-20261013-PROJECT-VIEWER.md). Incluyen IDs, SHAs, fixes, decisiones, evidencia, limites y destinos propuestos. Atlas leido en `27ae86c`, sin escrituras. No actualizar evidencia historica de deploy ni afirmar release mediante esta tanda.
