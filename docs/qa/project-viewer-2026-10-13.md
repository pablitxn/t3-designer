# QA local - miembro viewer de proyecto compartido

Fecha: 2026-10-13 UTC. Alcance: lectura y permisos de viewer, fixtures locales,
sin IA, Blender, correo, pagos, produccion, merge, deploy ni PR.

## Revisiones y contexto

- T3 inicial: checkout limpio `work`, SHA `7a851eb7ab703016d78c102afeaac2a8d97b08f3`.
  Fetch confirmado: HEAD coincide con origin/main. Rama propia:
  `qa/t3-project-viewer-20261013`.
- Atlas inicial: limpio `work@bce92720a7f7e7ee48e02e949485ae3ab1a7b921`.
  Fetch + fast-forward seguro a `27ae86c83cd4822e6f7c23c70a1b9397ffd39d9f`.
  Sin cambios documentales en Atlas. Se leyeron AGENTS, atlas-navigate,
  source-of-truth, catalogos de T3, wiki y retrospectiva del 12/10.
- Atlas ubica T3 dentro de Immolab, con owner de codigo propio. Su lectura
  de `a3579ee` y el deploy del 04/10 son evidencia historica; esta QA no
  acredita CI ni runtime de produccion.

## Inventario previo de rutas y acciones

Fuente principal: `apps/web/src/private/PrivateApp.tsx`, `api.ts`,
`ProjectFoundations.tsx`, `FoundationAgentWorkshop.tsx`, `ProjectCheckpoints.tsx`,
`apps/web/src/editor/ApartmentEditor.tsx`, `apps/web/src/walkthrough/Walkthrough.tsx`,
`apps/web/src/private/ProjectScene.tsx`, `apps/web/src/energy/ProjectEnergy.tsx`,
`apps/api/src/projects.ts`, `server.ts` y `foundation-agent.ts`.

| Ruta/superficie | Acciones accesibles al viewer | Limite |
| --- | --- | --- |
| `/login`, `/app` | Login, listado, abrir, recarga, historial, duplicar | Solo propios o membresias; viewer no es rol global |
| `/app/projects/:id` | Nombre/notas, bases, modelos aceptados, selectores de planta | Sin guardar, renombrar, compartir, agregar assets o planos |
| Bases originales | Consultar niveles, dimensiones, pais/direccion, fuentes, abrir plano | Campos deshabilitados; sin uploads/remover asignacion |
| Agentes | Leer actividad/versiones/iteraciones, elegir version, preview y refrescar | Sin iniciar, corregir, cancelar, reintentar ni aceptar |
| Recuperacion | Leer checkpoint y refrescar | Sin restaurar |
| Editor de proyecto | Cambiar variante/distribucion localmente, 3D/plano, paredes, grilla, seleccionar objeto | Sin mover, rotar, copiar, quitar, materiales, luces o divisores |
| `#walkthrough`, `#editor` | Entrar, mirar/caminar, pausar, ajustes, puertas, mapa, fullscreen, retorno | Visita temporal; no persiste contenido |
| Contexto | Edificio/luz solar, camara, capas y seleccion | Sin modificar contenido |
| Energia | Leer analisis y supuestos guardados | Sin modificar instalacion |
| `/api/projects/:id/references/:id/image` | GET/HEAD, nueva pestana | Acceso ligado al proyecto; no referencia privada del autor |
| `/api/projects/:id/assets/:id/files/model.glb` | Leer/descargar revision inmutable | No hay boton de descarga GLB en la UI del proyecto; URL autorizado si conserva membresia |
| `/app/assets` | Biblioteca/taller de la cuenta propia | No expone prompts, fotos, source.blend, manifiesto ni jobs del autor |
| `/app/credits`, `/app/usage`, ajustes, salir, demo | Navegacion global accesible; cuenta/idioma/tema propios | No otorga permiso en proyectos ajenos |
| `/app/generate` | Ruta global de generacion conceptual propia | Excluida inferencia; no representa editar un proyecto compartido |
| `/app/users` | No pantalla administrativa para viewer standard | Ruta cae al listado; no gestionar personas |
| `/app/projects/:id/edit` u otra ruta desconocida | No existe editor adicional | Cae al listado; probar URL no equivale a una mutacion autorizada |

El backend exige write para PUT, planos/assets POST, aceptar/cancelar/generar
y restaurar; owner para membresias. Viewer puede clonar a su cuenta. GET de
membresias tambien es owner-only. 404 oculta recursos ajenos; 401 indica sesion
no valida. Administrador global no implica acceso a proyectos ajenos.

## Escenario y reproduccion

Node 24, pnpm 12.7.0 y dependencias del lockfile. En este Cloud:

```sh
cd /workspace/t3-designer
source /workspace/.cloud-setup/activate.sh
pnpm install --frozen-lockfile
node scripts/qa/project-viewer-scenario.mjs
```

En otro workspace, usar Node/pnpm del repo y omitir el `source` especifico de
Cloud. El script abre `http://127.0.0.1:5193/login` (override:
`T3_VIEWER_QA_PORT`), muestra el ID/URL ficticio y crea SQLite/archivos en
un directorio temporal nuevo. Ctrl-C limpia solo ese escenario.

Cuentas ficticias: `viewer@example.test`, `owner@example.test`,
`outsider@example.test`. Password de demostracion: `viewer-local-demo-2026`.
No credenciales reales ni enlaces de activacion. No leer `.env`.

Fixtures: casa compartida revisada de dos plantas con una variante y dos
distribuciones, plano PNG minimo, GLB del bundle existente, actividad/versiones
ficticias y un checkpoint; proyecto compartido vacio; proyecto de otra cuenta.
El origen de las bases esta explicitamente marcado QA, sin revision humana o
inferencia real. La escalera no tiene geometria, por lo que no se certifica
transito entre pisos. Fixtures prueban visualizacion de datos existentes.

Se usan los modulos reales de auth/SQLite, proyectos, API de archivos, biblioteca,
uso, billing disabled, ProjectGenerations y FoundationAgent con `enabled: false`.
Health se inyecta offline; planner y
renderer fallan si alguien intenta llamarlos. No se inicia worker. Vite y API
usan puertos loopback separados por test; el control de revocacion/expiracion
opera directamente en el SQLite desechable, sin endpoints QA en el producto.

```sh
T3_VIEWER_CHROMIUM_PATH=/usr/bin/chromium pnpm test:viewer
```

En un host con navegadores Playwright instalados, omitir el override del binario.
Para WebKit instalado: `T3_VIEWER_WEBKIT=1` agrega ambos moviles y desktop.

## Motores y limites

Chromium del sistema `154.0.8037.57`, Debian 13; Playwright 1.63.0.
SwiftShader/ANGLE, WebGL por software; headless. Viewports CSS 375x812 y
430x932, `isMobile=true`, touch, DPR=1; desktop 1440x1000, sin touch, DPR=1.
Son emulaciones de viewport/input, no dispositivos fisicos iPhone/Android.

WebKit 26.6 / build 2359: BLOCKED antes de lanzar. `playwright install webkit`
intento los mirrors oficiales cdn.playwright.dev y
playwright.download.prss.microsoft.com; ambos devolvieron HTTP 403
`Domain forbidden`. No se modificaron red, politicas o permisos para eludirlo.
No hay prueba Safari fisica ni WebKit acreditada.

## Bugs corregidos

| ID | Reproduccion y evidencia previa | Correccion | Regresion |
| --- | --- | --- | --- |
| V01 | Quitar membresia con visor abierto; focus conservaba notas y escena. Trace inicial `results/project-viewer-revocation--2fffe-a-clean-retry-after-regrant-chromium-mobile-375/trace.zip` | ProjectEditor revalida al focus, visibilitychange y cada 60 s visible; 403/404 de lectura desmonta el documento. Mismo role/revision conserva seleccion local de planta/variante | Revocacion con pestaña abierta, regrant/retry, revocacion periodica durante el paseo |
| V02 | Un `/api/me` de A retenido llega despues de un nuevo check de B y vuelve a montar A. `regressions-1/results/project-viewer-a-delayed-o-bbd12--a-cross-tab-account-change-chromium-mobile-375/trace.zip` | Solo la respuesta del ultimo check de sesion puede actualizar identidad; conserva epoch de sign-in/sign-out | Cookie real cambia a B, liberar respuesta vieja, comprobar B tras fetch y React, lista y contenido aislados |
| V03 | Sliders del paseo sin nombre accesible porque output recibe asociacion implicita del label. `regressions-2/results/project-viewer-walkthrough-4292e--and-keeps-visits-temporary-chromium-mobile-375/error-context.md` | Nombres explicitos para altura, campo de vision y sensibilidad | Acceso por rol/nombre y ajuste por teclado de los tres controles |
| V04 | Captura movil pausada muestra minimapa pintado sobre instrucciones y boton continuar. `final/results/project-viewer-walkthrough-4292e--and-keeps-visits-temporary-chromium-mobile-375/walkthrough.png` de la primera ejecucion; la correccion se evidencia en `walk-final` | Overlay pausado pinta encima del minimapa con z-index 1; toolbar permanece disponible | Hit/paint order en el area donde mapa/tarjeta se cruzan; capturas en vivo y pausa |
| V05 | Durante el cambio de cuenta, un 401 tardio de taller/health/creditos de A invalidaba tambien la cookie nueva de B. La primera corrida completa fallo en mobile 430 | El aviso de 401 desmonta de inmediato los datos privados y revalida `/api/me` con la cookie actual; solo lleva a login si esa identidad tambien falta. Los callbacks de login, logout y recovery restauran estado ready | Regresion determinista con respuesta 401 real de la cookie anterior y checks de B retenidos; expiracion real de sesion sigue llevando a login |

La autorizacion del backend ya denegaba escrituras del viewer y recursos
revocados; no se modificaron permisos, endpoints ni politicas de seguridad.
Una revocacion no borra archivos ya descargados ni informacion previamente
vista. No es un push realtime: la UI reconoce revocacion al volver a la pestaña
o dentro del intervalo de 60 s con la pestaña visible. En falla transitoria
de red no se confunde falta de respuesta con una revocacion confirmada.

## Integracion con la sesion editor

Coordinacion recibida del parent: rama ajena `qa/shared-project-editor-20261013`,
HEAD reportado `7fe34e94419fe4c074937072dc55f85d5b216f3e`, con fixes de borrador
al cancelar navegacion, revocacion y downgrade a viewer. No se trajo ni se
presupone ese commit en este filesystem.

Superposicion principal: `apps/web/src/private/PrivateApp.tsx` / ProjectEditor.
Este patch solo instala la revalidacion periodica cuando el rol montado es
viewer. Al integrar, unificar la lectura de acceso con el handler de editor,
sin duplicar listeners/intervalos, sin reemplazar un borrador valido ni perder
sus guards de navegacion. Conservar el control de orden de `/api/me` y el key
por cuenta/proyecto. Diferenciar permiso de lectura revocado (403/404 GET de
proyecto) de un 403 de escritura tras downgrade, donde aun se permite leer.

Otros archivos compartidos para revisar: `e2e/private-auth.spec.ts`,
`Walkthrough.tsx`, `walkthrough.css`,
`e2e/walkthrough.spec.ts`, `playwright.config.ts`, `apps/web/package.json`,
`apps/web/tsconfig.json`, `package.json`. Los nuevos archivos de fixture,
config viewer, spec viewer e informe son independientes. Los scripts agregan
`test:viewer` al gate `check:all`; la suite real de API tiene config propia y
no se ejecuta accidentalmente con el perfil general sin WebGL. El override
opcional `T3_PLAYWRIGHT_EXECUTABLE_PATH` permite el Chromium disponible del
Cloud en la suite general y su spec de walkthrough, conservando los asserts.

## Resultados finales

Codigo probado y commiteado localmente: `c1de9b0ba1f05cdda676fd10fa96216ef5f353d9`.
Rama `qa/t3-project-viewer-20261013`, base `7a851eb7ab703016d78c102afeaac2a8d97b08f3`.
El commit documental posterior conserva este resultado; no hay PR, push, merge
ni deploy de esta tanda.

Corrida final estable: **54 PASS, 0 FAIL, 0 skips, 0 retries**: 18 flujos en
cada uno de los tres viewports Chromium. Inicio 11:05:04Z, duracion 14m22s.
JSON: verified/results.json (`../../artifacts/qa-project-viewer/verified/results.json`).
Indice de capturas/trazas: evidence-index.md (`../../artifacts/qa-project-viewer/evidence-index.md`).
Evidencia local ignorada por Git; los fixtures y comandos permiten regenerarla.

| Flujo/caso | 375x812 touch | 430x932 touch | 1440x1000 desktop | WebKit (3 viewports) |
| --- | --- | --- | --- | --- |
| Lista compartida; bases/planos; versiones; checkpoints; pisos; variantes; contexto y energia | PASS | PASS | PASS | BLOCKED |
| Proyecto vacio; biblioteca propia vacia; URL ajena/edit/admin | PASS | PASS | PASS | BLOCKED |
| Popup PNG y download GLB + SHA256; GET/HEAD/no-store; source/job/manifest ajenos; mutaciones prohibidas | PASS | PASS | PASS | BLOCKED |
| Revocacion con pantalla abierta; limpiar notas/visor; regrant + retry | PASS | PASS | PASS | BLOCKED |
| Sesion expirada real; Back no recupera datos; nuevo login | PASS | PASS | PASS | BLOCKED |
| Logout con doble clic; cambio de cuenta; reload y acceso directo al proyecto anterior | PASS | PASS | PASS | BLOCKED |
| Cambio externo de cuenta; 401 real tardio de A; checks de B pendientes; vieja respuesta positiva de A | PASS | PASS | PASS | BLOCKED |
| GET 503, respuesta abortada y navegacion cancelada mientras llega un GET | PASS | PASS | PASS | BLOCKED |
| Doble clic en duplicar: una copia propia, IDs de attachment nuevos, fuente intacta y referencias independientes | PASS | PASS | PASS | BLOCKED |
| Paseo renderizado; sliders con nombre/teclado; movimiento touch/teclado; cancelacion y pausa; capas; reload/hash/history | PASS | PASS | PASS | BLOCKED |
| WebGL ausente: fallback, ajustes y retorno usable | PASS | PASS | PASS | BLOCKED |
| Lista 503/retry; lista vacia tras revocar; nombre requerido y cancelacion sin crear | PASS | PASS | PASS | BLOCKED |
| GET sin respuesta: timeout real de 15 s, retry, sin escrituras | PASS | PASS | PASS | BLOCKED |
| Revalidacion conserva planta sin cambios; reloj simulado avanza 60 s; revocacion desmonta el paseo | PASS | PASS | PASS | BLOCKED |
| GLB eliminado en fixture: placeholder visible; restaurar archivo y reload recuperan el modelo | PASS | PASS | PASS | BLOCKED |
| Nombre 120 caracteres y notas/URL largas; markup como texto; sin overflow/HTML ejecutado | PASS | PASS | PASS | BLOCKED |
| Creditos/uso propios, ajustes con Consumo, generacion deshabilitada, vuelta al proyecto | PASS | PASS | PASS | BLOCKED |
| Clone persistido con respuesta perdida: error visible; copia unica se recupera desde el listado | PASS | PASS | PASS | BLOCKED |

Cada caso usa un escenario nuevo. Se verifican registros completos persistidos
contra la fuente inicial; los casos de escritura prohibida tambien verifican
attachments, jobs y saldo sin cambios. La navegacion de viewer, ajustes de
visita y variantes no envian mutaciones de proyecto. Las mutaciones autorizadas
son login/logout y copias a la cuenta propia sobre datos ficticios.

## Comandos y checks

Todos los comandos se ejecutaron tras `source /workspace/.cloud-setup/activate.sh`.
Los logs siguientes viven bajo `artifacts/qa-project-viewer/`.

| Comando | Resultado final | Evidencia |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | PASS, pnpm 12.7.0, lockfile conservado | Salida de setup; error inicial de pnpm 11 a home inexistente resuelto con herramientas del workspace |
| `pnpm check` | PASS: lint, tipos, 648 tests Node y 35 Python, scene:verify en lectura, build demo, audit dist | `check-final.log`; Turbo usa cache para tareas intactas |
| `pnpm typecheck`, `pnpm lint` despues del perfil WebKit ancho | PASS | `types-final.log`, `lint-final.log` |
| `pnpm build:full` y `pnpm audit:dist` | PASS, 703 artefactos auditados, cero failures | `build-full.log`, `audit-full.log` |
| `T3_VIEWER_CHROMIUM_PATH=/usr/bin/chromium T3_VIEWER_EVIDENCE_DIR=../../artifacts/qa-project-viewer/verified pnpm test:viewer` | 54 PASS en revision final; 0 retries | `verified.log`, `verified/results.json` |
| `T3_PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium pnpm --filter @t3-designer/web exec playwright test --grep-invert @webgl --workers=1 --output=... --reporter=list,json` | 114 PASS, 2 SKIPPED | `aggregate-verified.log`, `aggregate-verified/results.json` |
| `playwright test e2e/walkthrough.spec.ts --grep 'opening the viewer settings' --workers=1` con override del browser | PASS, pausa mantiene pose al abrir/cerrar ajustes | `walk-interaction.log`, `walk-interaction/results.json` |
| `playwright test e2e/walkthrough.spec.ts --grep 'E operates' --workers=1` con override y puerto 4184 | PASS en reejecucion aislada, puertas/paso/reset temporal | `door-isolated.log`, `door-isolated/results.json` |
| `pnpm audit:history` | PASS; se repite despues de los commits locales | `audit-history.log` |
| `git diff --check` | PASS | Verificacion final antes de commits |

Los dos casos de catastro omiten su ejecucion por ausencia de
`T3_CABA_RESEARCH_DIR`; no se adquirieron datos reales para llenarlos.
Los dos checks WebGL adicionales usan fixtures existentes mockeados como owner,
canvas de interaccion reducido por su helper, mismo Chromium por software;
no se contabilizan como pruebas viewer con backend real ni como prueba fisica.
La suite viewer conserva su canvas normal y sus tres viewports declarados.

## Fallos de diagnostico, pendientes y limites

- Primera corrida completa anterior al ultimo fix: 50 PASS / 4 FAIL en mobile
  430. Uno valido V05 (401 antiguo cerraba la cuenta nueva); tres esperas de
  carga/visibilidad durante servidores concurrentes. Tras aislar el cache de
  Vite y fijar auth, la corrida completa dio 54/54 sin retries. No se afirma
  causalidad exclusiva de cache para cada espera anterior.
- Suite general inicial con dos workers: 108 PASS / 6 FAIL / 2 SKIPPED. Cuatro
  eran setup del spec walkthrough, cuyo launchOptions descartaba el override
  del Chromium del sistema. El override opcional conserva los asserts y los
  cuatro recorridos pasaron. Dos eran esperas de historial de assets.
- Worktree separado del SHA inicial: el mismo spec de historial tuvo 2 PASS /
  2 FAIL (403/404 quedaban cargando al agotar 5 s); en retry aislado de esta
  rama dio 4/4. Es un problema de estabilidad observado tambien sin este
  patch, sin nuevo defecto de permisos acreditado. La suite serial final dio
  114/114 ejecutados. No se cambian sus asserts ni sus timeouts.
- Check adicional de puertas bajo render paralelo fallo en 2.1309 m frente a
  `>2.15 m` a los 15 s. El mismo test aislado paso, incluyendo abrir/cerrar,
  colision de paso, reset de puerta y ausencia de escrituras. El primer FAIL
  queda registrado en `walk-interaction`; no se ajustaron umbrales.
- WebKit: BLOCKED por descarga 403 del entorno. Safari e iPhone/Android reales:
  NOT RUN. Otras resoluciones/orientaciones, hardware GPU, accesibilidad completa
  y desconexion fisica de red: NOT RUN.
- Escaleras y transito entre plantas: NOT RUN en fixture viewer, sin geometria
  soportada. Premium/admin como planes globales de un miembro viewer: NOT RUN
  en el escenario real (se uso cuenta standard). Invitacion/recovery reales,
  IA, Blender, geodata en vivo, correo, pagos, CI y produccion: NOT RUN por scope.
  Las pruebas agregadas de auth usan mocks para invite/recovery.
- `check:all` entero, suites analytics/demo y todos los demas checks WebGL:
  NOT RUN. Se conservan sus gates; `check:all` ahora suma la suite viewer.
- No bug reproducible de lectura/permisos viewer pendiente tras los fixes y
  regresiones declarados. Los limites anteriores siguen abiertos.
- No hay boton GLB en el proyecto. Se probó el URL permitido. Una copia con
  respuesta perdida ya puede existir; revisar el listado antes de volver a
  duplicar, pues no se agrego idempotencia de clone ni una nueva decision de UX.

El escenario tambien aisla `vite-cache` en su directorio temporal. Las corridas
de diagnostico anteriores compartian optimizaciones entre servidores Vite y
podian invalidar imports durante pruebas paralelas. No se cambian timeouts o
asserts de las suites existentes para ocultar los resultados.

## Checklist manual breve

1. Levantar el escenario con el comando anterior; iniciar sesion como viewer.
   Confirmar solo Casa compartida QA y Proyecto vacio QA, ambos "Puede ver".
2. Abrir la casa, revisar bases/planos, abrir el PNG en otra pestaña y mirar
   versiones/checkpoint. No debe haber guardar, compartir, uploads o restaurar.
3. Cambiar planta y distribucion, seleccionar el objeto; controles de posicion,
   rotacion, quitar, materiales y luces deben estar deshabilitados. Recargar:
   vuelve la planta guardada, sin modificaciones del proyecto compartido.
4. Abrir el paseo, ajustar altura/FOV/sensibilidad por teclado o touch, entrar,
   caminar y pausar. La tarjeta debe leerse encima del minimapa; volver, usar
   Back/Forward y revisar que no persiste la visita.
5. En otra sesion de navegador independiente (no otra cuenta en la misma cookie),
   entrar como owner, abrir el mismo proyecto y "Quitar acceso" al viewer.
   Volver a su pestaña: desaparece el visor y aparece proyecto no disponible.
   Abrir/reload del plano o URL GLB debe denegarse. Recompartir como viewer y
   usar Reintentar recupera la lectura.
6. Duplicar: la copia debe ser propia, independiente del original. Cerrar sesion
   y entrar como outsider; la URL del original debe mostrar no disponible.
   Revisar tambien login despues de recarga y Back/Forward.
7. Repetir en movil real si se desea validar hardware/touch físico y en Safari;
   esa evidencia esta fuera de la emulacion y del WebKit bloqueado de esta tanda.

Para obtener el GLB de demostracion desde una pantalla con sesion valida, abrir
DevTools > Network y el request `/api/projects/<id>/assets/<attachment>/files/model.glb`.
La app no tiene boton de descarga de GLB del proyecto; el test ejercita el URL
autorizado en el navegador y verifica SHA256 de los bytes. No abrir artefactos
de `/api/assets/<source>/...` del autor: no corresponden al permiso compartido.

## Resumen para Atlas (sin escritura aqui)

T3 agrega evidencia local para miembro viewer en main/base `7a851eb`, sobre
Chromium del Cloud y datos desechables. Las correcciones son UI de revocacion,
orden de respuestas de cuenta y lectura/accesibilidad del paseo; autorizacion
server-side queda intacta. Fuente primaria: este informe y la rama QA indicada.
No acredita produccion, Safari/iPhone/Android, IA/Blender, precios/cobros ni CI.
Consolidar la revalidacion de ProjectEditor con el resultado de la sesion editor
al integrar. Atlas consultado en `27ae86c`, sin nuevas entradas ni cambios de
catalogo; Immolab y las evidencias historicas conservan su vigencia declarada.
