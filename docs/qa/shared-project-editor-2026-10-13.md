# T3: QA del editor de proyecto compartido (2026-10-13)

Alcance: miembro standard con permiso `editor` en un proyecto ajeno. Escenas y assets existentes; sin inferencia, generación, render Blender, pagos, correo, datos de producción, merge ni deploy. El escenario usa la escena bundled como geometría de demostración, usuarios `@example.test`, proyectos aislados y bases SQLite temporales. No modifica archivos de modelos.

## Revisión y contexto

- Checkout T3 limpio inicial: rama `work`, `7a851eb7ab703016d78c102afeaac2a8d97b08f3`. `fetch origin` y `ls-remote origin refs/heads/main` devolvieron ese mismo SHA. No se descartaron cambios ni se usó reset. Rama de trabajo: `qa/shared-project-editor-20261013`. Checkpoint de implementación: `f304628a3fdc96ba1efbfa3d4b4735a4f53a31ec`; el HEAD final consta en `git-metadata.json` de la evidencia.
- Atlas limpio inicial: `work@bce92720a7f7e7ee48e02e949485ae3ab1a7b921`; fetch y fast-forward a `27ae86c83cd4822e6f7c23c70a1b9397ffd39d9f`. Sin cambios de contenido en Atlas.
- Leídos: ambos AGENTS, atlas/AGENTS, atlas-navigate, source-of-truth, catálogos de repos/relaciones, wiki T3, retrospectiva IMM-02 y workflows `private-projects.md` / `local-asset-workshop.md`.
- Atlas atribuye T3 a Immolab y separa baseline local del 12/10 de deploy histórico del 04/10. Esta tanda agrega evidencia local; no revalida producción, CI remota, proveedores ni PostgreSQL.
- No se expuso una herramienta para comprobar/cambiar el modelo efectivo, reasoning o velocidad de esta sesión; esos ajustes no se acreditan por inspección del repo.

## Inventario previo del rol

Derivado de `App.tsx`, `PrivateApp.tsx`, `ApartmentEditor.tsx`, `ProjectScene.tsx`, `AccountHub.tsx`, `api.ts`, `projects.ts` y `server.ts`.

| Ruta | Acciones accesibles y frontera |
| --- | --- |
| `/login` | Login, validación, error genérico, demo y ajustes. |
| `/app` | Lista propia/compartida, abrir, crear/cancelar y duplicar. |
| `/app/projects/:id` | Nombre/notas, guardado explícito por revisión, recuperación 409, duplicado propio. Sólo propietario administra miembros; editor no puede agregar/quitar acceso. |
| Editor listo | Cambiar/duplicar variantes y layouts; seleccionar/colocar/mover/rotar/duplicar/quitar instancias; undo/redo; cámara 3D/plano/muros/snap; acabados/pisos/aberturas/luces y fecha/hora solar. Divisores son otra acción disponible, excluida del recorrido real de esta tanda. |
| Inspección del proyecto | Recorrido en primera persona; contexto/sol del edificio; energía solar. Biblioteca personal para adjuntar un asset existente al proyecto. |
| Fundamentos según documento | Editar preparación/planos/fuentes; seleccionar plantas aceptadas; leer historial/versiones/checkpoints; workshops de vivienda/edificio y aceptar/cancelar/restaurar con los permisos correspondientes. Las acciones de generación están deshabilitadas en este escenario. |
| `/app/assets` | Biblioteca e historial privados, previsualización/descarga; generación/revisión/retry/cancel disponibles sólo según configuración. Sin activos personales en los fixtures reales de esta tanda. |
| `/app/credits`, `/app/usage` | Saldo/plan/consumo propio. Checkout deshabilitado. |
| `/app/generate` | Ruta directa de generación conceptual; excluida y deshabilitada. |
| `/app/users` | Sólo admin o premium con invitaciones; no aparece para editor standard. Ser admin global no concede acceso privado al proyecto. |
| `/invite`, `/recover`, `/` | Activación/recovery y demo pública separados; no implican membresía del proyecto. |

## Motores y límites

Playwright 1.63.0, Chromium del sistema **154.0.8037.57**, ejecutable `/usr/bin/chromium`, Linux. WebGL 2 real con ANGLE/SwiftShader; rasterizado por software, sin prueba de GPU física. Navegación, inputs, selectores, clics, un tap móvil, screenshots y efectos persistidos se ejecutaron en navegador.

| Configuración | Viewport CSS | isMobile / hasTouch | Estado |
| --- | --- | --- | --- |
| Chromium mobile narrow | 360 x 800 | true / true | PASS |
| Chromium mobile wide | 430 x 932 | true / true | PASS |
| Chromium desktop | 1440 x 1000 | false / false | PASS |
| WebKit 26.6 requerido por Playwright (build 2359) | mismos tres tamaños previstos | móvil/desktop | BLOCKED: binario ausente; descargas oficiales CDN y mirror devuelven 403 Domain forbidden |

Los tamaños móviles son emulación táctil. No se probaron dispositivos físicos iPhone/Android, Safari de sistema ni Firefox. La versión WebKit indicada es la requerida por el paquete, no un motor ejecutado. Los timestamps, versión efectiva y opciones del contexto están adjuntos al reporte de cada test.

## Matriz de recorridos

`C360`, `C430` y `C1440` corresponden a las tres configuraciones Chromium anteriores. Todos los casos reales usan Vite full -> proxy -> entrypoint de API -> Better Auth/SQLite. Los fixtures renuevan usuarios/proyectos por test. Las fallas de transporte se inyectan en el navegador; los casos de pérdida de respuesta y timeout hacen primero `route.fetch()` contra el backend real y verifican el commit en DB.

| Flujo | C360 | C430 | C1440 | Evidencia / efecto comprobado |
| --- | --- | --- | --- | --- |
| Login requerido, required fields, password incorrecto y login válido | PASS | PASS | PASS | Error genérico, cookies/sesión del backend real. |
| Listado propio/compartido y acceso por ID ajeno | PASS | PASS | PASS | Proyecto extraño ausente y pantalla no disponible. |
| Límites owner/editor y admin sin grant | PASS | PASS | PASS | Compartir no aparece; POST/DELETE de miembros 403; admin ve 404. |
| Variantes/layouts independientes y acabados | PASS | PASS | PASS | Dos variantes; layouts preservan muebles, pisos, puertas, cortinas y luz de 4000 K. Save/reload y lectura DB. |
| Notes como texto, nombre vacío y valor numérico inválido | PASS | PASS | PASS | HTML no ejecutado; whitespace no guarda; campo inválido vuelve al valor anterior. |
| Doble clic de guardar y undo/redo | PASS | PASS | PASS | Una revisión persistida, sin alerta falsa; estados de objetos correctos. |
| Edición concurrente del owner y 409 | PASS | PASS | PASS | Borrador retenido, botones bloqueados, recarga del owner y posterior revisión 3. |
| Respuesta perdida después del commit | PASS | PASS | PASS | Abort del transporte; retry da 409, no segundo commit; recarga reconcilia. |
| Timeout real de respuesta | PASS | PASS | PASS | Espera de 16s contra timeout de app de 15s; mismo resultado persistido/reconciliado. |
| Error inicial y retry; error de guardado antes del commit | PASS | PASS | PASS | 503 de carga recuperable; draft retenido y revisión intacta antes de retry. |
| Cancelar link/logout, Atrás/Adelante y aceptar salida | PASS | PASS | PASS | Draft preservado al cancelar; aceptar salida descarta sólo draft, no DB. |
| Revocar durante edición | PASS | PASS | PASS | PUT rechazado; escena/controles retirados; DB intacta; reload/list no exponen proyecto. |
| Revocar durante recuperación 409 | PASS | PASS | PASS | GET 404 retira escena previamente cargada; persiste cambio del owner. |
| Downgrade editor -> viewer y sesión revocada | PASS | PASS | PASS | PUT 403, campos readonly, sin Save; sesión real eliminada y foco lleva a login sin datos privados. |
| Copia independiente propiedad del editor | PASS | PASS | PASS | Cambios sólo en copia; owner original no cambia; compartir aparece sólo en la copia propia. |
| Biblioteca/lista de proyectos vacías y cancelar creación | PASS | PASS | PASS | Cero proyectos tras cancelación/invalid required; outage de lista recuperable. |
| Créditos y consumo propios | PASS | PASS | PASS | Saldo visible, checkout disabled, pantalla de consumo. |
| Assets existentes: colocar/rotar/duplicar/quitar, plano y contexto | PASS | PASS | PASS | Dos instancias persistidas, tap en móvil, cámara y contexto sin modificar modelo GLB. |
| Respuesta tardía tras cambiar de proyecto | PASS | PASS | PASS | Commit permitido llega tarde; no reemplaza campos del otro proyecto. |
| Asset privado adjunto y aislamiento entre layouts | NOT RUN | NOT RUN | NOT RUN | PASS suplementario con mocks existentes en desktop y WebGL disabled; no acreditado con API real por esta tanda. |
| Preparación multi-floor, upload de planes, aceptar/restaurar checkpoints | NOT RUN | NOT RUN | NOT RUN | Escenario real usa un proyecto legacy listo; no se acreditan estos recorridos UI en esta tanda. |
| Workshop de generación/retry/cancel, IA/Blender, diseño de geometría | NOT RUN | NOT RUN | NOT RUN | Excluido por mandato; ningún job de generación iniciado. |
| Walkthrough, edición de energía, fullscreen, descarga de assets personales | NOT RUN | NOT RUN | NOT RUN | Inventariados, no recorridos por este rol aquí; contexto y biblioteca vacía sí inspeccionados. |
| Toda la matriz en WebKit | BLOCKED | BLOCKED | BLOCKED | Setup del motor, no defecto de producto. |

Bugs de producto pendientes conocidos en los recorridos ejecutados: ninguno. Bloqueos y superficies NOT RUN se enumeran arriba. No queda cobertura absoluta acreditada. La revocación se detecta al siguiente request del proyecto o reload; no se agregó polling de membresías ni se promete borrar información ya descargada.

## Bugs corregidos y evidencia anterior

1. **Cancelación de history perdía el draft.** Baseline real: `cancel route...` FAIL; URL queda `/app` tras cancelar Atrás. El router raíz consulta `t3:before-navigate` antes de actualizar la ruta; el editor conserva un único guard. Regresión prueba cancelación de Atrás, Adelante, link y logout, además de salida confirmada.
2. **Revocación conservaba el editor.** Baseline real: `revocation during edit...` FAIL; error genérico y controles todavía presentes tras PUT 404. Ahora retira el proyecto cargado y muestra no disponible; los GET 403/404 tampoco conservan una escena vieja.
3. **Downgrade a viewer conservaba escritura aparente.** Baseline real: `downgrade to viewer...` FAIL; Save/inputs seguían editables aunque PUT devuelve 403. Ahora descarta la edición no autorizada y obtiene el documento con el rol vigente. El servidor ya rechazaba ambas escrituras: no se cambió autorización backend.

Baseline estable: 7 PASS / 3 FAIL en Chromium 360. Primeras ejecuciones también tuvieron errores del propio harness (selector de label que incluye opciones, aserción de ValidityState y respuesta 503 de un solo uso consumida por StrictMode); se corrigieron sin cambiar producto ni debilitar assertions. Las regresiones mantienen retries=0.

## Comandos y resultados

En este Cloud el wrapper pnpm inicialmente intentó instalar/validar dependencias en su directorio personal de datos (fuera del workspace). Se utilizaron las dependencias ya instaladas con los flags de pnpm para evitar esa reparación automática. No se cambiaron gates, dependencias ni lockfile.

```sh
# Reproducción de los recorridos reales
T3_QA_CHROMIUM=/usr/bin/chromium \
  pnpm --config.manage-package-manager-versions=false \
       --config.verify-deps-before-run=false test:shared-editor \
       --project chromium-mobile-narrow --project chromium-mobile-wide --project chromium-desktop

# Gates completos sobre la revisión final
pnpm --config.manage-package-manager-versions=false --config.verify-deps-before-run=false check
pnpm --config.manage-package-manager-versions=false --config.verify-deps-before-run=false build:full
pnpm --config.manage-package-manager-versions=false --config.verify-deps-before-run=false audit:dist
```

- Matriz real: 45 PASS (15 casos x 3 viewports), 0 FAIL, 0 skipped, 0 flaky, retries=0. Recheck del fixture con probe Blender aislada: otros 3 PASS, uno por viewport.
- `check`: PASS; lint, tipos, 648 tests Node y 35 Python, scene:verify, build demo, audit demo (671 archivos, cero fallos).
- `build:full`: PASS; audit full PASS (703 archivos, cero fallos).
- Regresiones existentes `editor.spec.ts` y `private-auth.spec.ts`: 12 PASS, desktop Chromium 1440 x 1000, WebGL disabled, mocks existentes. Config temporal conservada en evidencia. No se usaron como sustituto de los recorridos reales.
- `git diff --check`: PASS. El audit final detectó una ruta personal en este informe nuevo; se retiró la ruta del documento y se reejecutó el gate sin modificar su política.
- WARN previos: chunks Vite de más de 500kB, deprecación THREE.Clock, env NO_COLOR/FORCE_COLOR. No se rebajaron umbrales para ocultarlos.
- WebKit: FAIL del launcher por binario ausente, clasificado BLOCKED; instalación en `/workspace/.cache/t3-browsers` falla con 403 de los hosts oficiales. Sin cambio de permisos/políticas para eludirlo.
- Health: el recorrido de biblioteca consultó la comprobación de disponibilidad `blender --version`; no ejecutó generación/render ni modificó modelos. El fixture final apunta esa comprobación a un binario inexistente para evitar también esa llamada en próximos arranques.
- Launcher manual: arranque y `/api/live` 200 comprobados; SIGINT al proceso cerró servidores y retiró su directorio temporal. En esta PTY Cloud, el carácter Ctrl+C no llegó al proceso Node; se usó SIGINT al PID propio. En terminal normal usar Ctrl+C.

## Evidencia y archivos compartidos

Evidencia local ignorada por Git: `artifacts/qa/shared-editor-20261013/`. Contiene logs/reportes, resultados de browser, PNGs, trazas, config temporal suplementaria y resumen JSON/CSV. Cada trace se abre con `pnpm --filter @t3-designer/web exec playwright show-trace <trace.zip>` (o binario local de Playwright).

Muestras inspeccionadas: desktop guardado (`../../artifacts/qa/shared-editor-20261013/browser-final/shared-editor-variants-lay-be98d-ist-through-save-and-reload-chromium-desktop/saved-editor.png`), plano móvil ancho (`../../artifacts/qa/shared-editor-20261013/browser-final/shared-editor-existing-obj-1e72e-oval-and-context-inspection-chromium-mobile-wide/existing-assets-plan.png`), traza de cancelación móvil (`../../artifacts/qa/shared-editor-20261013/browser-final/shared-editor-cancel-route-d3e0d-ion-preserves-unsaved-draft-chromium-mobile-narrow/trace.zip`), matriz CSV (`../../artifacts/qa/shared-editor-20261013/matrix.csv`). Estos enlaces son archivos locales de esta sesión, no material publicado en Git.

Cambios de producto compartidos que requieren integración con las otras ramas: `apps/web/src/App.tsx` y `apps/web/src/private/PrivateApp.tsx`. Integración de tooling: `package.json`, `apps/web/package.json`, `apps/web/playwright.config.ts` y `apps/web/tsconfig.json`. Archivos nuevos del rol: fixture/spec/config de shared-editor, launcher de demostración y este informe. Sin cambios en modelos, assets, backend, políticas, credenciales ni Atlas.

## Checklist manual reproducible

1. Desde la raíz del repo, ejecutar `node apps/web/test/shared-editor-demo.ts`. Usa Node >=24 y dependencias del repo. El proceso imprime origen loopback, URL del proyecto, emails ficticios y password de fixture; no pide claves ni muestra links de activación. Todo persiste sólo mientras vive este escenario temporal. Mantener la terminal abierta.
2. Abrir perfiles/sesiones de navegador separados para `editor`, `owner` y `admin`, usando exclusivamente las credenciales de fixture impresas. En editor, ir a `/login`, entrar, abrir la card Shared editor y comprobar rol Puede editar. No aparece Compartir; admin sin grant ve proyecto no disponible.
3. En editor, duplicar variante y distribución. Mover una instancia del asset existente y cambiar piso/puerta/luz. Guardar, recargar y alternar los layouts: el original conserva sus opciones. La biblioteca personal está vacía; no iniciar workshops.
4. Abrir el mismo proyecto en owner y editor. Guardar notas distintas en owner; intentar guardar el editor con revisión anterior. Debe aparecer conflicto, conservar draft y permitir Cargar última versión.
5. Cambiar notas sin guardar; intentar cerrar sesión, link Todos los proyectos y Atrás/Adelante. Cancelar conserva el draft. Aceptar salida descarta sólo los cambios no guardados.
6. Desde Compartir en owner, cambiar el acceso del editor a viewer (o quitarlo). Con editor ya abierto, intentar guardar: readonly tras downgrade; proyecto no disponible y sin controles tras revocación. Recargar/listar confirma el mismo límite.
7. Usar la suite reproducible para pérdida de respuesta, timeout y respuestas tardías: primero hace un commit real y luego interrumpe/retiene la respuesta. No requiere provocar fallas en servicios externos.
8. Detener con Ctrl+C en terminal normal; si el Cloud no transmite la señal, enviar SIGINT al PID de este launcher únicamente. El cleanup cierra Vite/API y borra las bases ficticias. Un nuevo arranque genera cuentas/proyectos independientes.

## Resumen para integrar después en Atlas

T3 `qa/shared-project-editor-20261013`, sobre `7a851eb`, recibió fixes locales para cancelación de history y controles tras revocación/downgrade del editor. Evidencia en este informe y artifacts; no pushed/merged/deployed. QA real Chromium móvil/desktop con Better Auth/SQLite, sin inferencia ni creación de modelos. Admin global sin membresía sigue sin acceso privado. WebKit bloqueado por egress oficial; PostgreSQL/producción, modelos aceptados multi-floor y generación no acreditados en esta tanda. Atlas quedó limpio en `27ae86c`; incorporar este resumen en su intake en una sesión posterior, sin confundir estos resultados con deploy histórico del 04/10.
