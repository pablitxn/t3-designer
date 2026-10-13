# T3 — integracion QA de cinco roles (2026-10-13)

Estado: DRAFT, matrices locales completas; CI requiere diagnostico de admin/viewer. No aprobado para merge/deploy. Este reporte reemplaza el estado transversal; los informes fuente conservan evidencia historica de sus propias ramas.

Base `origin/main`: `7a851eb7ab703016d78c102afeaac2a8d97b08f3`. Rama de trabajo `qa/t3-integration-20261013`. Codigo funcional inicial con check completo: `657060b0b459753c2d52c0643357bc1dd732ba51`; correccion final de renderer `67ad9ec8c1770788a7b6f34f34316bca67ccb26e`; retencion/diagnosticos CI agregados despues. Las matrices iniciadas en `e4cb70f` se completaron y los suites afectados por INTEGRATION-B01 se reejecutaron despues del fix, sin presentar todo como una sola tanda inmutable. [Proveniencia completa](sources.json).

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

La base pasa `audit:history` (785 blobs, 8 commits). Anonimo, admin, owner y viewer pasan sus auditorias de historial fuente. Editor falla por `personal home directory` en un blob historico de `docs/qa/shared-project-editor-2026-10-13.md`; el informe final ya habia retirado la ruta pero el ancestro seguia alcanzable. La integracion inicial de cinco tips pasa 852 blobs/13 commits. El corte funcional final `657060b` pasa 877 blobs/18 commits; la auditoria de publicacion se repite sobre el informe consolidado.

El SHA original de viewer se reprodujo en un worktree detached: lint/tipos/tests de paquetes pasan, pero el test de links documentales rechaza dos enlaces relativos a artifacts ignorados ausentes. El primer check integrado reproduce esos dos mas cuatro de editor. Se convierten a referencias textuales locales; el gate queda intacto. `pnpm check` integrado pasa: 658 Node + 35 Python, lint, tipos, scene snapshot en lectura, build demo y auditoria de 696 archivos. Build full final y auditoria pasan 735 archivos; el check final pasa con auditoria demo de 703 archivos. Los counts cambian con los chunks/cache, y se conserva la salida exacta por comando. Los logs remotos de los fallos fuente devolvieron 403; estas causas estan respaldadas por reproduccion local, no por un log remoto descargado.

Owner rechazó primero `artifacts/integration-qa/owner` como ruta de datos: es una proteccion deliberada. La ejecucion correcta usa `artifacts/owner-qa/integration-20261013`; no se amplio el allowlist.

## Defecto adicional reproducido al integrar

**INTEGRATION-B01**: `AssetsExplorer` abortaba el primer fetch en el replay de efectos StrictMode pero retenia la referencia del controlador. El segundo setup no iniciaba lectura y esperaba 3 s al polling; con carga se agotaban las aserciones de 5 s. La referencia se limpia al desmontar, y el nuevo setup inicia inmediatamente. La misma linea defectuosa existe en la base `7a851eb`.

Regresion determinista: solo el intervalo de polling de 3 s se retrasa a 60 s, conservando reloj/scheduler/carga lazy reales; en app base falla `Taller conectado`, en la correccion pasa, sin aumentar timeouts. Evidencia `initial-connection-baseline` y `initial-connection-fixed`. Los intentos previos con reloj completo pausado no alcanzaron la app y no se usan como validacion; un primer fixture tambien tenia una asercion equivocada sobre el boton requerido, corregida antes de usarlo como gate. Un intento de base sin binario Playwright fallo en setup; el harness separado se ajusto al mismo Chromium de sistema sin alterar app base.

Primera suite generica: 103 PASS, 11 FAIL, 2 SKIPPED; fallos de conexion del taller antes de la correccion. Se conservan logs/trazas y se reejecutan esos suites con los mismos gates. No se presentan como simples fallos de entorno. El fixture nuevo tuvo un error de tipos por mezclar Window con timers Node; se tipa como Window de navegador y se reejecuta check completo.

Editor: primera matriz 50 PASS / 1 FAIL (51 casos). Fallo estrecho al abrir la copia: clone 201 persistido, GET nuevo 200 en traza y una lectura inicial abortada tras ~18 s; la UI mostro error de conexion en vez del titulo. Reejecucion del mismo caso en los tres perfiles: 3 PASS con gates originales. Se conserva el fallo y no se atribuye una causa de producto no reproducida. Las 51 combinaciones quedan consolidadas en varias tandas, no una unica corrida 51/51.

## Matrices y evidencia

[Matriz final por flujo/perfil](flow-matrix.csv) y [todas las tandas validas, incluidos fallos previos](run-matrix.csv). Los flags reales de contextos se extraen de las trazas; owner usa contextos secundarios del mismo ancho pero sin emular touch en algunos casos de sharing. El viewer dedicado si usa touch/isMobile en ambos perfiles. Un viewport nominal no se presenta como dispositivo fisico.

## Evidencia y alcance

Resultados actuales de integracion: anonimo 60 PASS, admin 42 PASS, owner 54 PASS; editor 51 combinaciones PASS consolidadas (50/51 primera tanda + recuperacion 3/3), taller 54 PASS y 12 recorridos reales afectados PASS, owner WebGL 3 PASS. Suite generica corregida 115 PASS / 2 SKIPPED de cadastro en vivo (teatro-colon/museo-larreta, excluidos del escenario aislado); dos regresiones WebGL adicionales se ejecutaron aparte: settings PASS y puertas PASS aislado con los gates originales; analytics 31 PASS, demo 3 PASS y cuentas reales 1 PASS. Viewer 54 PASS; WebGL anonimo 21 PASS. Ningun FAIL local pendiente en la matriz final; los fallos iniciales se conservan en la matriz de tandas. No trasladar PASS de informes anteriores automaticamente. Evidencia local: `artifacts/integration-qa/`, `artifacts/owner-qa/integration-20261013/`, `artifacts/qa-global-admin/`. DB y session-secret son fixtures locales ignorados; no se incluyen en entregables publicos. Las capturas/trazas locales no estan publicadas en Git.

Chromium de sistema 154.0.8037.57, Playwright 1.63.0 y viewports exactos en cada JSON/browser-context/trace. Emulacion touch: anonimo 320x568 y 430x932; admin 320x740 y 430x932; owner/editor 360x800 y 430x932; viewer 375x812 y 430x932. Desktop 1440x1000. WebGL usa software SwiftShader y assets existentes. Anonimo reduce DPR a .5 y desactiva sombras solo en el harness de interacciones, como en su fuente; owner/viewer mantienen su DPR y sombras. No son pruebas de fidelidad. Las capturas de viewer congelan temporalmente el loop real, sin cambiar geometria, sombras, DPR ni estado de input, y lo restauran inmediatamente. No se acredita calidad 3D ni dispositivo fisico.

WebKit: BLOCKED por descarga 403 conocida, sin reintento de allowlists ni permisos. Safari, Firefox, telefonos fisicos, PostgreSQL, GPU fisica, correos, pagos/proveedores reales, Blender/modelado/render y produccion: NOT RUN. Sin inferencia externa ni solicitudes OpenAI/Codex. No se afirma cobertura absoluta.

## CI publicado y limites de diagnostico

[PR DRAFT #8](https://github.com/pablitxn/t3-designer/pull/8). En `657060b`, run [38397546627](https://github.com/pablitxn/t3-designer/actions/runs/38397546627), pasan `check`, owner, owner-webgl y shared-editor; admin, viewer y anonymous-webgl fallan. Anonymous-webgl tambien falla en ese run; el detalle no es accesible por descarga. Las tres causas especificas de CI requieren el proximo diagnostico. `gh run view --log-failed` devuelve 403 del host de descarga firmado; no se exponen firmas ni se cambia allowlist. Las causas especificas de estos tres fallos de CI aun no estan verificadas. No se marca la integracion lista para merge.

Los jobs independientes de roles y el check global se ejecutan en paralelo, conservando todos los gates y la exigencia de verde completo para revision. La siguiente revision retiene solo browser-results/results.json y anota errores reales de los JSON para leerlos por API aun si la descarga de logs esta bloqueada. Se excluyen SQLite, session-secret y seeds de los uploads. Los gates originales siguen fallando cuando corresponde. Un primer borrador del diagnostico tuvo un lint por regex ANSI; se usa `stripVTControlCharacters` de Node y el lint especifico pasa. Estado de la revision publicada final: consultar checks del PR y recibo local `artifacts/integration-qa/publication.json`; el reporte no adelanta un PASS de CI.

## Correcciones verificadas tras CI

En `8ad0f58`, run [38403119343](https://github.com/pablitxn/t3-designer/actions/runs/38403119343), admin se recupera y pasan global, owner, editor y owner-webgl. Viewer falla solo por screenshot desktop de 15 s; anonymous-webgl falla por screenshot pausado de 90 s, muestreo tardio del estado transitorio del salto y retorno que agota 30 s. Estas causas se leen en anotaciones API reales, sin eludir el 403 de descarga.

Corte `67ad9ec8c1770788a7b6f34f34316bca67ccb26e`: Canvas del paseo usa demand cuando esta pausado y always cuando camina. El harness de captura de viewer congela el ultimo frame real solo durante la imagen, conserva DPR/sombras y restaura el loop en finally; viewport y presupuesto 15 s permanecen. Un MutationObserver registra la transicion real grounded=false desde antes del clic, y el test sigue exigiendo aterrizar en 60 s. No se modifica data-grounded ni se simula el salto.

Checks locales: check completo PASS (658 Node +35 Python); anónimo afectado 9/9 PASS, viewer con captura inicial 3/3 PASS y con pausa/revocacion 6/6 PASS aislado, puerta 1/1 PASS aislado. Una tanda de tres suites GPU concurrentes tuvo 2 timeouts de UI en viewer y 1 de distancia en puertas; se retienen en run-matrix y sus casos se recuperan en serial, sin aumentar limites. El intento de captura inicial usaba fullPage por error del harness; se conserva viewport como la fuente. La revision final debe pasar CI antes de considerarse lista. No se crea un paquete pesado nuevo; recuperacion por rama/PR publicados.

## Reproducir y revisar manualmente

Instalar Node 24/pnpm 12.7 y `pnpm install --frozen-lockfile --ignore-scripts`. En este Cloud, primero `source /workspace/.cloud-setup/activate.sh`. Para otro host, instalar Chromium con Playwright y omitir overrides del sistema. Usar perfiles de navegador independientes y directorios nuevos; no cargar `.env` productivo.

- Anonimo: `node scripts/qa-anonymous.mjs`, puerto 4190. Recorrer tabs, ajustes/reload, dossier/cierre con foco, galeria/version/imagen retry, slider/paseo. [Guia fuente](../../workflows/anonymous-qa.md).
- Admin: `pnpm qa:admin`, launcher con datos ficticios y billing mock. Validar motivo corto, invitaciones/cupo, suspension permitida, compra mock/reload, consumo y cuenta ajena. [Guia fuente](../2026-10-13-global-admin.md).
- Owner: dos terminales segun [guia](../owner-20261013.md), backend explicito `NODE_ENV=development T3_OWNER_QA=isolated-fixtures T3_QA_DIRECTORY=artifacts/owner-qa/manual-integrated node apps/api/test/owner-qa-backend.ts` con claves/proveedores/database/telemetry externos ausentes; web full en 4189 con proxy 8798. Tomar solo cuentas/password ficticios del seed local. Crear proyecto/intake, adjuntar archivo, guardar, cancelar Atrás con borrador, resolver conflicto, preguntas/correcciones/aceptacion, retry/cancel y descarga mock. No usar esos archivos como datos productivos.
- Viewer/editor: escenario `node scripts/qa/project-viewer-scenario.mjs` segun [guia viewer](../project-viewer-2026-10-13.md). El owner comparte desde una sesion independiente como viewer/editor. Verificar lectura sin controles de escritura; editor cambia notas y guarda. Con borrador dirty, cancelar link/Atrás mantiene URL y texto. Quitar acceso/cambiar rol desde owner, volver al focus: desaparecen controles/datos no autorizados. Logout/nuevo login no recupera datos de otra cuenta. [Guia editor](../shared-project-editor-2026-10-13.md).

Detener solamente los procesos propios con Ctrl-C. Para desactivar los mocks de generacion, detener el backend QA y arrancar el entry point normal `apps/api/src/index.ts` con datos aislados y `T3_GENERATION_ENABLED=false`. Los mocks no forman parte del arranque normal de produccion; fallan cerrados ante NODE_ENV production o ruta/origin no permitidos.

## Predocumentacion para Atlas

Cinco fichas **pendientes de consolidacion**: [anonimo](predocumentation/T3-QA-20261013-ANONYMOUS.md), [admin](predocumentation/T3-QA-20261013-GLOBAL-ADMIN.md), [owner](predocumentation/T3-QA-20261013-PROJECT-OWNER.md), [editor](predocumentation/T3-QA-20261013-SHARED-EDITOR.md), [viewer](predocumentation/T3-QA-20261013-PROJECT-VIEWER.md). Incluyen IDs, SHAs, fixes, decisiones, evidencia, limites y destinos propuestos. Atlas leido en `27ae86c`, sin escrituras. No actualizar evidencia historica de deploy ni afirmar release mediante esta tanda.
