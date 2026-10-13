# QA del visitante anonimo - 2026-10-13

Estado de trabajo: cierre de QA en curso. Las pruebas WebGL finales se enumeran
abajo; este informe no acredita deploy ni pruebas fisicas.

## Revision y entorno

- T3 inicial/`origin/main`: `7a851eb7ab703016d78c102afeaac2a8d97b08f3`.
- Rama aislada: `qa/t3-anonymous-20261013`; checkout inicial limpio.
- Fetch normal y explicito de `refs/heads/main`, `ls-remote` y fast-forward
  comprobados. No hubo reset, merge de otras ramas, push, PR ni deploy.
- Atlas inicial: `bce92720a7f7e7ee48e02e949485ae3ab1a7b921`; actualizado por
  fast-forward a `27ae86c83cd4822e6f7c23c70a1b9397ffd39d9f`. Sin ediciones de
  contenido Atlas. Se leyeron AGENTS, atlas-navigate, politica, wiki y entry T3.
- Cloud Linux, Node 24.19.0, pnpm 12.7.0, Playwright 1.63.0, Chromium del
  sistema 154.0.8037.57. Chromium fijado 153.0.8010.12 y WebKit 26.6/v2359
  no pudieron descargarse: proveedores oficiales devuelven 403 Domain forbidden.
- Emulacion tactil 320x568 y 430x932; desktop 1440x1000. Las suites heredadas
  que cambian su viewport se documentan aparte; el nombre del proyecto no
  acredita que una prueba mantuvo ese tamano. No son iPhone/Android fisicos.
- Backend real loopback/SQLite, directorios de cada corrida separados, sin
  .env, sin cuentas reales, generacion/pagos/OTLP deshabilitados. Solo assets
  y dossier ficticio publicados. Errores de red y tiles usan fixtures locales.

## Inventario desde codigo

Leido antes de seleccionar casos: `App.tsx`, `workspace-view.ts`,
`ApartmentExplorer`, `PublicArrangement`, `useDemoLayout`, `usePublicArrangement`,
`PublicAssetsExplorer`, `DossierExplorer`, `BuildingExplorer`, `SolarControls`,
`EnergyWorkbench`, `Walkthrough`, `ApplicationSettings`, `SettingsDialog`,
`PrivacyControls`, `PrivacyPage` y frontera `PrivateApp`/`AccountForm`.

| Ruta/superficie | Acciones accesibles al visitante |
| --- | --- |
| `/`, hash desconocido | Edificio por defecto; cinco tabs; enlaces privados y ajustes |
| `/#apartment` | Perspectiva/planta/reset de camara; ampliar/salir; capas corte, muebles, labels, contexto; ocho habitaciones/vista general; catalogo/detalle/descarga GLB; solar |
| Mobiliario publico | Elegir/agregar/quitar 21 instancias originales y tres objetos existentes; grupos colapsables; mover/rotar movibles; instalaciones fijas; teclas/flechas/Shift/R; undo/redo/reset; cancelar arrastre/Escape; guardado local automatico y sincronizacion entre tabs |
| `/#walkthrough` | Visor de referencia; entrar/pausar/reanudar/salir; punto de inicio/reset; fecha/hora/restaurar hora; luces/linterna; altura/FOV/sensibilidad; controles en pantalla; caminar/girar/saltar; puertas cuando hay una puerta interactiva; fullscreen |
| `/#building` | Perspectiva/mapa/reset/ampliar; vecinos/trayectoria/labels/paneles; localizar/vista completa; cortes edificio/piso/interior; entrar al departamento; controles luz/energia; fuentes/enlaces externos |
| Solar compartido | Fecha 1900-2100; estaciones; reloj/slider; play/pause; mediodia; noche/dia; DST; orientacion y supuestos |
| Energia publica | Tabs sol/paneles/consumo/inversion; fecha/slider compartidos; parametros instalacion/clima mensual/perdidas; consumos y tarifas; moneda; resultados/capacidad; guardar/restaurar/descartar escenario local |
| `/#documentation` | Cinco secciones; tarjetas/estadisticas; busqueda/limpiar/vacio; ocho superficies; observaciones; 13 fichas de fuentes/copia local/guia externa; volver a visores; imprimir |
| `/#assets` | Tres objetos, cuatro versiones existentes; perspectiva/frente/perfil/visor; historial/select; evidencia/correcciones; producto externo; descarga GLB; dos CTA a `/app/assets` en build full |
| Ajustes | Idioma auto/es/en/fr; tema sistema/claro/oscuro; unidades metricas/imperiales; privacidad/consentimiento; Escape/fondo/cierre/foco; persistencia y tabs |
| `/privacy` | Politica, operador ausente/configurado, retorno y navegacion/historial |
| `/app`, `/app/assets`, demas rutas privadas | Visitante redirigido a `/login`; no biblioteca/proyectos privados |
| `/login` | Correo/password, validacion nativa, submit/busy/error/reintento; ajustes; volver a demo; registro cerrado/invitacion y ayuda de recuperacion |
| `/invite`, `/recover` | Enlace ausente/invalido, hash saneado y rechazo. Activacion exitosa y cuentas autenticadas corresponden a otros roles |

## Defectos corregidos

1. Dossier: cerrar una ficha con Escape dejaba el foco en body. Se preserva el
   opener y se restaura al desmontar el dialogo. Reproduccion independiente en
   Chromium y regresion Escape/boton/fondo; tambien con copia local en popup.
2. Galeria: una respuesta perdida/404 para una imagen dejaba un img roto sin
   estado recuperable. Mensaje y reintento traducidos conservan objeto/version;
   cambiar vista reinicia el estado de esa imagen. Regresiones de perdida de
   respuesta, reintento, version y traducciones es/en/fr.
3. Recorrido: las etiquetas implicitas de altura/FOV/sensibilidad nombraban el
   output y dejaban los sliders sin nombre accesible. IDs unicos y asociaciones
   explicitas permiten identificarlos y modificarlos por teclado. Regresion
   previa FAIL y posterior PASS en los tres viewports.
4. Recorrido estrecho: el minimapa quedaba por encima de las instrucciones y
   parte del boton de entrada. Se corrigio el orden de pintura del overlay;
   el minimapa sigue visible durante la visita. Captura y regresion de hit
   testing previas FAIL; verificacion final de entrada en los tres tamanos.

Las pruebas previas que fallan por estos defectos se conservan en
`artifacts/qa-anonymous/bugs-before`, `slider-before` y `overlay-before`. Todos
existian antes de estos cambios. Los primeros asserts nuevos equivocados
(default edificio, selectores y labels) se corrigieron en los tests, sin cambiar
producto. La primera tanda heredada tuvo una recarga HMR durante una ficha de
ajustes; se repite completa con fuentes estables. Las suites WebGL heredadas
sobrescribian executablePath: se agrego override opcional para Chromium del
sistema conservando sus asserts. Esto es setup, no un defecto de producto.
Los renders de software concurrentes agotaron plazos en casos largos. El
arrastre en planta paso aislado. Se separaron las pantallas y grupos de
controles del recorrido en casos independientes, manteniendo los assertions y
180 segundos por caso. Un salto dispone de hasta 60 segundos para completar sus
frames; no se saltea la comprobacion de aterrizaje. La primera captura de visor
de galeria se tomo antes del GLB; fue reemplazada por espera de meshes cargadas,
gesto de orbita comprobado y captura del visor visible. No se acredita render
con las capturas vacias previas.

## Evidencia actual

- `pnpm check`: PASS (lint, tipos, 648 tests Node y 35 Python, scene verify,
  build, audit dist: 672 archivos, cero fallos). Log final de codigo:
  `artifacts/qa-anonymous/checks/review-final.log`.
- Demo de produccion sin backend: 3 PASS. Log:
  `artifacts/qa-anonymous/checks/demo-final.log`.
- Suite publica completa: 180 PASS en `final-ui`. Incluye 42 casos nuevos y
  138 heredados. Los heredados tienen overrides de viewport declarados abajo.
- Gate `pnpm test:anonymous`: 60 PASS en `gates-final`, sobre los tres viewports
  exactos, incluyendo las regresiones de foco/imagenes/sliders.
- Privacidad/analytics de produccion: 29 PASS en `analytics`; collector, tracker
  y perfil de operador interceptados con fixtures ficticios. Se excluyeron
  expresamente las dos pruebas de taller privado/cuentas autenticadas.
- Mapa: 2 PASS desktop en `map-drag-final`; tiles sinteticos, recenter, zoom,
  atribucion, 100% de tiles fallidos y reintento. Drag 3D: PASS en esa tanda;
  drag planta: PASS en `drag-isolated`. Ambos usan 1284x926, sin tactil.
- Launcher manual: galeria -> login por UI PASS en 430x932 tactil, API live200,
  biblioteca protegida401. `checks/manual-launcher.json` y captura adjunta.
- SQLite inspeccionada despues de detener el backend: cero users, sessions,
  projects, assets, jobs, foundation runs, creditos/pagos y llamadas/uso IA.
  Cuatro filas de rate-limit corresponden a intentos de acceso ficticios.
  Conteos: `checks/backend-counts.json`; no se entregan DB ni session secrets.
- CI simulado: 1 PASS usando la nueva disposicion de evidencias en
  `apps/web/test-results/anonymous/ui`. Datos/secret locales quedan en un tmp
  separado y no entran en los artifacts de CI. YAML de ambos proveedores validado.
- Capturas y traces de cada test bajo `artifacts/qa-anonymous/<corrida>/browser`.
  `results.json` y `report/index.html` contienen cada resultado, error y adjunto.
- Recuperacion del environment comprobada a las 10:29 UTC: shell, Git,
  procesos/API/Vite y escrituras de evidencia siguen disponibles.

## Matriz de flujos

PASS significa ejecucion UI y assertions aprobados; FAIL corresponde a defectos
reproducidos antes del fix o a una ejecucion identificada como fallida. BLOCKED
es falta de motor/capacidad. NOT RUN conserva lo excluido o no ejecutado.
La matriz CSV de casos individuales se entrega junto con evidencias y resultados
JSON; no se suman reruns como cobertura adicional.

| Flujo/fixture | 320 tactil | 430 tactil | Desktop | Evidencia/limite |
| --- | --- | --- | --- | --- |
| `/`, cinco tabs, link directo, hash desconocido, recarga, back/forward | PASS | PASS | PASS | anonymous: visitor inventory; default edificio |
| Ajustes auto/es/en/fr, sistema/claro/oscuro, unidades y persistencia | PASS | PASS | PASS | settings/i18n y privacy navigation; overrides heredados abajo |
| Foco/modal Escape, fondo, Tab/Shift-Tab; storage invalido/denegado | PASS | PASS | PASS | settings, i18n, main gate |
| Departamento: capas, ocho rooms, vista general, todos los detalles y GLB | PASS | PASS | PASS | anonymous-details; capas/restauracion/detalle seleccion persistida |
| Muebles: add/remove/presencia, catalogo vacio y grupos colapsables | PASS | PASS | PASS | layout/arrangement + public arrangement; 21 originales + 3 existentes |
| Giro doble, undo/redo/reset/undo, navegacion/recarga | PASS | PASS | PASS | localStorage comparado; reset no borra preferencias ajenas |
| Movimientos validos, fuera de perimetro y fijos rechazados | PASS | PASS | PASS | demo-layout; posiciones persistidas; no cambio de modelos |
| Dos tabs sincronizan movimientos/presencia/reset; contexto nuevo aislado | PASS | PASS | PASS | storage events y contexto nuevo sin layout |
| Storage corrupto/quota excedida, recuperacion y estado sin guardar | PASS | PASS | PASS | demo-layout, corrupt layout y energy quota fixture |
| Solar noche/mediodia/estaciones, vacios/rango y DST | PASS | PASS | PASS | date/time, 29/03 gap y 25/10 repeticion |
| Solar play/pause y pausa al navegar; momento compartido | PASS | PASS | PASS | inputs comparados entre departamento y edificio; momento temporal |
| Edificio capas/cortes/localizar/entrar al departamento | PASS | PASS | PASS | anonymous-details; controles pressed/checked |
| Energia: cuatro paneles, guardar/recargar/cero/descartar | PASS | PASS | PASS | energy; guardado explicito y valores persistidos |
| Energia: capacidad, escenario invalido, inversion extrema, clima/fecha | PASS | PASS | PASS | energy; no cobertura combinatoria de todos los parametros |
| Energia: todos los combos de monedas/clima mensual/consumo | NOT RUN | NOT RUN | NOT RUN | Codigo inventariado; casos representativos y tests calculos, no todas las combinaciones UI |
| Dossier cinco secciones/busqueda/limpiar/vacio/copia local | PASS | PASS | PASS | i18n + dossier; contenido ficticio y popup local |
| Dossier 13 fuentes, Escape/cierre/fondo y foco del opener | PASS | PASS | PASS | FAIL previo corregido; anonymous-details/source dialog |
| Impresion: media print y seccion elegida | PASS | PASS | PASS | captura print; boton de impresion de app solo desktop |
| Impresora/dialogo nativo del SO | NOT RUN | NOT RUN | NOT RUN | No impresora ni dispositivo fisico; window.print interceptado |
| Galeria tres objetos/cuatro versiones/imagenes/evidencia/GLB | PASS | PASS | PASS | 512px naturalWidth, version/historial y descarga exitosa |
| Imagen perdida/404, retry, version conservada y es/en/fr | PASS | PASS | PASS | FAIL previo corregido; imagen antes/despues y traces |
| CTA proyectos/taller -> login real con backend | PASS | PASS | PASS | anonymous + launcher; visitante redirigido |
| Login vacio/email invalido sin request, credenciales ficticias | PASS | PASS | PASS | validacion nativa y 401 real; no cuentas creadas |
| Login respuesta perdida, busy/doble submit, 429 y cancelacion | PASS | PASS | PASS | un submit, draft retenido, navegacion cancela respuesta tardia |
| API/session503/retry; cookie expirada/invalida y rutas privadas | PASS | PASS | PASS | 401 reales + fallos inyectados; no datos privados visibles |
| Invite/recover ausente/invalido/hash saneado | PASS | PASS | PASS | tokens ficticios invalidos, sin activaciones ni correo |
| Sesion autentica expirada/aislamiento de dos cuentas validas | NOT RUN | NOT RUN | NOT RUN | Otro rol; aqui se comprueba visitante/contextos y cookie invalida |
| Privacidad link/pagina/retorno/historial/consentimiento local | PASS | PASS | PASS | gate y analytics; analytics incluye 390/375px especificos |
| Tracker/collector fallidos, DNT/GPC, revocacion/expiracion y tabs | NOT RUN | NOT RUN | PASS | 29 casos de production analytics: 1440x1000 y dos casos 390x844 sin touch; no servicio real |
| Mapa tiles/zoom/recenter/atribucion/error/retry | NOT RUN | NOT RUN | PASS | 2 casos desktop; tiles ficticios. OSM real no consultado |
| Arrastre WebGL planta/perspectiva; instalacion fija | NOT RUN | NOT RUN | PASS | 1284x926; mueve instancia existente, no geometria |
| Visores WebGL, orbita tactil/desktop y modelo no disponible | EN CURSO | EN CURSO | EN CURSO | Tanda atomica final, 180s/caso; esperar render real para captura |
| Recorrido entrar/mover/saltar/pausar/reanudar/blur/salir | EN CURSO | EN CURSO | EN CURSO | Touch events Chromium y mouse desktop; no prueba fisica |
| Recorrido ajustes/fecha invalida/sliders/reset/luces/linterna | EN CURSO | EN CURSO | EN CURSO | Nombres accesibles corregidos; sin persistir diseño |
| Entrada legible encima del minimapa, mapa visible activo | EN CURSO | EN CURSO | EN CURSO | FAIL previo, CSS corregido; hit testing real y captura |
| Fullscreen/captura mouse denegados: fallback de UI | EN CURSO | EN CURSO | EN CURSO | Denegacion intencional, no acredita permiso nativo |
| Pointer Lock/fullscreen nativos exitosos | NOT RUN | NOT RUN | NOT RUN | No se atribuye la denegacion inyectada al producto |
| Correr/agacharse/puertas durante recorrido real | NOT RUN | NOT RUN | NOT RUN | Controles inventariados; no todos ejercitados en este rol |
| WebKit | BLOCKED | BLOCKED | BLOCKED | WebKit26.6/v2359, descarga oficial403 Domain forbidden |
| Hardware GPU/iPhone/Android fisicos | NOT RUN | NOT RUN | NOT RUN | Chromium headless/SwiftShader y emulacion |
| Crear/modificar modelos, fidelidad, IA, pagos/correo/deploy | NOT RUN | NOT RUN | NOT RUN | Excluidos por mandato |

Overrides de viewport (no se confunden con los nombres de proyecto):

- `apartment-viewer`: 1284x926; caso estrecho 605x926.
- `arrangement-controls`: 1284x926; caso estrecho 605x926.
- `building-studio`, demo-layout multi-tab, public-assets, energy mobile y
  i18n mobile: 390x844 en sus casos especificos.
- settings narrow: 320x568. i18n international-date-line usa un contexto
  separado por defecto 1280x720 sin touch.
- Casos nuevos `anonymous*` conservan 320x568/430x932/1440x1000; el contexto de
  aislamiento adicional tiene 1280x720 sin touch. Metadata de cada caso adjunta
  engine, viewport, maxTouchPoints y coarse-pointer.
- Analytics: 1440x1000 general y 390x844 para los dos casos mobile, sin
  emulacion tactil. Se corre una vez por caso, sin multiplicar la cobertura.
- WebGL es SwiftShader con DPR0.5 y sombras deshabilitadas para interaccion;
  no acredita FPS, rendimiento hardware, iluminacion exacta ni fidelidad.

## Escenario manual aislado

```sh
source /workspace/.cloud-setup/activate.sh # Solo en este environment Cloud
cd /workspace/t3-designer
node scripts/qa-anonymous.mjs
```

El launcher muestra el directorio temporal. La web local usa puerto 4190 y API
8790; se pueden cambiar con `T3_ANONYMOUS_WEB_PORT`/`T3_ANONYMOUS_API_PORT`.
No lee .env, no crea usuario, no necesita clave ni enlace de activacion y no
llama IA. Usar un perfil/incognito nuevo para empezar con almacenamiento vacio.
Ctrl-C detiene solo sus dos procesos. No borrar datos ajenos; sus directorios
temporales son distintos de `artifacts/cloud-dev` y de produccion.

Pruebas reproducibles:

```sh
T3_ANONYMOUS_EXECUTABLE=/usr/bin/chromium pnpm --filter @t3-designer/web exec playwright test --config playwright.anonymous.config.ts
T3_ANONYMOUS_EXECUTABLE=/usr/bin/chromium T3_ANONYMOUS_WEBGL=1 pnpm --filter @t3-designer/web exec playwright test --config playwright.anonymous.config.ts
```

Omitir `T3_ANONYMOUS_EXECUTABLE` para los binarios oficiales instalados. WebKit:
`T3_ANONYMOUS_BROWSER=webkit` y seleccionar `anonymous-webgl.spec.ts` o
`anonymous.spec.ts`; las suites heredadas de mapa/drag usan flags Chromium.
Nunca interpretar su falta de binario como un fallo de la aplicacion.

Checklist manual corto:

1. En viewport estrecho, recorrer las cinco tabs y back/forward; abrir ajustes,
   cambiar idioma/tema/unidades, cerrar y recargar.
2. Departamento: agregar STRANDMON, quitar una instalacion, rotar la mesa,
   undo/redo/reset/undo, recargar y contrastar otra pestana y otro incognito.
3. Solar: 29/03/2026 02:30, 25/10/2026 02:30, noche y play; cambiar de vista y
   verificar pausa. Energia: guardar cuatro paneles, cambiar a cero, descartar,
   recargar y comprobar guardado.
4. Dossier: buscar un termino existente/inexistente, abrir fuentes, Escape y
   Tab para comprobar retorno de foco; copia local e impresion.
5. Galeria: DYVLINGE v1/v2 y tres vistas; descargar GLB. Con la red deshabilitada
   para front.png, comprobar mensaje; restaurar red y reintentar.
6. Recorrido con assets existentes: entrar, controles tactiles, pausa, luces,
   linterna, reset/salir. No iniciar generacion ni alterar geometria.
7. CTA privado: login, formulario vacio, correo invalido y credenciales
   ficticias; volver a demo y verificar que no se expusieron datos privados.

## Retorno para Atlas (sin escrituras)

T3 pertenece a Immolab. Atlas documenta baseline a3579ee del 12/10 y deploy
historico ade9bf2/20a426f del 04/10; esta QA sobre main 7a851eb y rama local
no revalida aquel deploy. Integrar despues resultados UI, limites de motores,
dos fixes y SHA finales en el intake de T3. No se consultaron servicios reales,
GitOps, DNS, pagos, correo ni proveedor IA. No hay cambio de arquitectura ni
nueva decision de producto.
