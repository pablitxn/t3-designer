# QA local: administrador global de T3

Revision inicial: `7a851eb7ab703016d78c102afeaac2a8d97b08f3`, rama `work`,
checkout limpio. `git fetch origin` confirmo que `origin/main` coincide con ese
SHA; no hubo cambios ajenos que mover o descartar. Rama de trabajo:
`qa/t3-global-admin-20261013`. Commit de codigo probado: `6c2b96b06c90710c4117cc8f354cc935a48b8cfe`.
Los commits locales contienen los cambios y este informe; `git log -2 --oneline` identifica la revision entregada.
No hubo push, PR, merge de la rama QA ni deploy.

Atlas estaba limpio en `work@bce92720a7f7e7ee48e02e949485ae3ab1a7b921`.
Fetch y fast-forward autorizado a
`27ae86c83cd4822e6f7c23c70a1b9397ffd39d9f`. Se leyeron AGENTS, la skill local
`atlas-navigate`, politica de fuentes, catalogos, wiki T3 y retrospectiva del
12/10. No se redactaron cambios en Atlas. El origin del checkout portable es
GitHub; la referencia GitLab y el deploy historico de Atlas no se revalidaron.

## Escenario y limites

Navegador real automatizado con Playwright 1.63.0 y Chromium del sistema
`154.0.8037.57`, ejecutable `/usr/bin/chromium`. Backend real desde
`apps/api/src/index.ts`, Vite full, Better Auth y SQLite en directorios nuevos
`/tmp/t3-global-admin-*` para cada caso. Backend y navegador usan loopback,
origen y puertos aislados. La fixture no carga `.env` ni hereda credenciales de
IA, Mercado Pago, exportadores de trazas o sesiones Codex. No se enviaron
correos, se operaron datos reales ni se llamaron proveedores de IA/pago.

| Proyecto Playwright | Viewport CSS | Entrada | Zona horaria |
| --- | --- | --- | --- |
| chromium-mobile-narrow | 320 x 740 | isMobile=true, hasTouch=true; incluye taps | America/Argentina/Buenos_Aires |
| chromium-mobile-wide | 430 x 932 | isMobile=true, hasTouch=true; incluye taps | America/Argentina/Buenos_Aires |
| chromium-desktop | 1440 x 1000 | mouse y teclado | America/Argentina/Buenos_Aires |

Locale `es-AR`. En la corrida final los contextos secundarios heredan tambien
viewport, touch y zona horaria del caso. Son emulaciones, no pruebas fisicas
en iPhone/Android. WebGL esta deshabilitado; ningun caso requiere generacion,
Blender o render 3D.

WebKit 26.6 / revision Playwright 2359: **BLOCKED**. Tanto
`cdn.playwright.dev` como el fallback `playwright.download.prss.microsoft.com`
devolvieron `403 Domain forbidden` al descargar `webkit-debian-13.zip`.
La descarga del Chromium Playwright 1243 fallo igual; se uso el Chromium
instalado, registrando su version real. No se modificaron politicas de red,
permisos del sistema ni credenciales para eludir el bloqueo.

Node `24.19.0`, pnpm `12.7.0`. El pnpm inicial del environment era 11.25.0 y
su auto-setup intento escribir fuera del workspace. Se instalo el pnpm indicado
por el repo con cache y prefix bajo `/tmp`, sin cambiar lockfile ni dependencias
del producto. Hubo un aviso de desconexion del environment; los comandos,
procesos y estado Git siguieron disponibles y no se perdieron avances.

## Inventario previo de rutas y acciones

Inventario desde [PrivateApp](../../apps/web/src/private/PrivateApp.tsx),
[AccountHub](../../apps/web/src/private/AccountHub.tsx),
[UsagePage](../../apps/web/src/private/UsagePage.tsx),
[accounts](../../apps/api/src/accounts.ts),
[billing](../../apps/api/src/billing.ts),
[projects](../../apps/api/src/projects.ts) y
[server](../../apps/api/src/server.ts). Contratos:
[cuentas privadas](../workflows/private-projects.md),
[creditos/billing](../credits-billing.md) y
[workshop local](../workflows/local-asset-workshop.md).

| Ruta UI | Acciones accesibles | Cobertura de este rol |
| --- | --- | --- |
| /login | iniciar sesion; Ajustes; demo | login real, expiracion y cambios de cuenta |
| /invite | consultar enlace, activar cuenta, validacion, error terminal | personal premium y compartible standard; vencido/agotado |
| /recover | reset con token del operador | NOT RUN; recuperacion se reserva al flujo de identidad |
| /app | lista propia, crear/cancelar proyecto, abrir/copiar | vacio y aislamiento de lista; CRUD propio fuera de esta tanda |
| /app/users | personales y compartibles, copiar, revocar; listar cuentas; tier; credito; sesiones; suspension/reactivacion | matriz inferior |
| /app/credits | saldo, reservas, grants y movimientos; planes; checkout, simulacion mock, refresh, cancelacion | disabled/mock, persistencia y aislamiento |
| /app/usage | periodos, proyecto, tipo, proveedor, estado, detalle, refresh y paginacion | fixtures reales persistidas y aislamiento |
| Ajustes > Consumo | detalle/filtros, cierre modal, volver al formulario | datos reales de fixture y borrador preservado |
| /app/projects/:id | editor/fundamentos/miembros/checkpoints segun membresia | acceso ajeno denegado; GET/PUT/clone/members 404 |
| /app/assets | biblioteca privada y workshop | NOT RUN; otro rol; no generar ni renderizar |
| /app/generate | propuesta conceptual | NOT RUN; generacion excluida |
| / y demo publica | explorar demo/edicion 3D/energia | NOT RUN; fuera del rol asignado |

API de cuentas revisada: `/api/me`, `sign-in`, `sign-out`,
`accept-invitation`, `invitation`, `invitations`, `invitation-links`, revocacion
de ambas clases, `users`, `users/:id/tier`, `credits`, `suspend` y
`revoke-sessions`. `reset-password` inventariado, no ejecutado en UI.
Billing revisado: `/api/billing`, `checkout`, `refresh`, `cancel`,
`mock/:orderId/approve`. Webhook/sandbox no operados. `/api/credits` y
`/api/usage` siempre se limitan a la cuenta autenticada.

## Matriz de recorridos

Estado final de la corrida ampliada: **42/42 PASS**.
Cada fila es un test compuesto, repetido en los tres proyectos Chromium.
Los casos verifican UI y persistencia, no solo status HTTP. WebKit esta bloqueado
en todas estas filas. PASS significa que se cumplieron las aserciones descritas,
incluidos los rechazos esperados; no significa ausencia absoluta de defectos.

| ID / fixture y flujo | 320 | 430 | Desktop | Persistencia / evidencia |
| --- | --- | --- | --- | --- |
| A01 Email invalido; personal premium; activacion; copiar denegado; usada/revocada | PASS | PASS | PASS | tier real, usada deshabilitada, revokedAt; people-invitations.png |
| A02 Motivo corto; grant 25; respuesta perdida; doble envio; premium on/off/on | PASS | PASS | PASS | 125 -> 1125 -> 125 -> 125, una concesion por requestId; people-grants.png |
| A03 Dos sesiones; revocacion; suspender/reactivar; admins protegidos | PASS | PASS | PASS | sesiones eliminadas, suspension persistida, login recuperado; people-session-control.png |
| A04 Suscripcion mock pendiente; reload; respuesta de aprobacion perdida; doble clic; cancelar/no cancelar | PASS | PASS | PASS | una orden/un pago; saldo 1000 -> 1500 conservado al cancelar; billing.png |
| A05 Consumo vacio y 26 intentos; completo/parcial/ausente; proveedor; 503/retry; paginas; otra cuenta | PASS | PASS | PASS | consumidos 260, devueltos 260; Standard solo 20; usage.png |
| A06 Proyecto/orden de otra cuenta; GET/PUT/clone/members; back/forward; expiracion real de sesion | PASS | PASS | PASS | 404, lista propia vacia, login al expirar; isolation-navigation.png |
| A07 Standard no invita; premium 10/20; admin 100/1000; dias >30; personal sobre cupo; revocar/vencer/agotado | PASS | PASS | PASS | rollback al superar cupo y plazas liberadas; invitation-limits.png |
| A08 People 503 y reload; sin invitaciones; billing disabled | PASS | PASS | PASS | formulario/listado recuperados, 0 ordenes, botones de compra disabled; disabled-billing.png |
| A09 Standard con suscripcion y ambos packs; trial vencido | PASS | PASS | PASS | 100 -> 600 -> 700 -> 1200 -> 1100; 3 pagos mock, nunca canInvite; billing-packs-expired-trial.png |
| A10 Respuesta perdida al invitar; revocar fila recuperada; enlace vencido | PASS | PASS | PASS | orphan revocable, 4 usuarios sin alta invalida; expired-invite.png |
| A11 Nombre 100 / motivo 240 sin espacios | PASS | PASS | PASS | no overflow del documento, valores completos; people-long-fields.png / wallet-long-fields.png |
| A12 Hoy/30 dias/todo; tipo/estado; fechas invertidas; navegar durante peticion; back | PASS | PASS | PASS | totales coherentes, refresh disabled para fecha invalida, sin datos tardios en People; usage-filters-navigation.png |
| A13 Compartible standard de 2 usos; 2 cuentas nuevas; agotado | PASS | PASS | PASS | 2 redenciones, trial 100 por cuenta, proyectos vacios; share-link-redemption.png |
| A14 Ajustes > Consumo; detalle; tabla ancha; Escape | PASS | PASS | PASS | borrador intacto; ninguna invitacion enviada; settings-usage.png |

Regresion adicional backend: personal y shared compiten concurrentemente por
la ultima plaza; solo uno se guarda. Revocacion y expiracion liberan plazas;
metadata canInvite vieja no permite nuevas invitaciones tras democion.
Archivo: [invitation-capacity.test.ts](../../apps/api/test/invitation-capacity.test.ts).
La suite anterior de invitaciones tambien pasa: tier, permisos, redencion
concurrente, vencimiento/revocacion y suspension/democion del invitador.

## Bugs corregidos

| Bug presente en la base | Correccion focalizada | Regresion |
| --- | --- | --- |
| B01 Motivo de grant de 1-4 caracteres/solo espacios llega al backend y produce error generico | minimo 5 sobre texto trimmed y maximo 240, igual al contrato API | A02 |
| B02 Boton Suspender aparece para otro admin, pero servidor lo prohibe | no mostrar accion prohibida para administradores | A03 |
| B03 Recargar checkout mock pendiente elimina el unico boton de confirmacion; suscripcion queda bloqueada para continuar | usar ordenes persistidas para reabrir confirmacion mock; conservar estado inmediato si refresh falla | A04, A09 |
| B04 Invitaciones personales evaden los cupos premium/admin | contar personales pendientes y plazas shared en la misma transaccion/lock; revalidar invitador | A07 y regresion concurrente |
| B05 Nombres de 100 caracteres sin espacios desbordan mobile | envolver el nombre; proteger tambien motivos largos dentro del panel flexible | A11 |

Las capturas/trazas previas a correcciones estan en
`artifacts/qa-global-admin-before-fixes`,
`artifacts/qa-global-admin-quota-baseline` y
`artifacts/qa-global-admin-long-fields-baseline`.
Durante desarrollo tambien se corrigieron selectores del harness y la espera
de hidratacion antes de capturar tras reload. Esos fallos del harness y las
capturas prematuras no se contabilizan como bugs del producto. No se modificaron
snapshots ni se rebajaron gates. La primera matriz de 12 casos obtuvo 36/36;
la corrida ampliada agrega A13/A14 y controles de los contextos secundarios.

## Comandos y resultados

```sh
pnpm check
pnpm audit:history
T3_QA_CHROMIUM_PATH=/usr/bin/chromium pnpm test:admin
node --test apps/api/test/invitation-capacity.test.ts apps/api/test/credit-invitations.test.ts
```

`pnpm check`: PASS en la revision de producto, con lint, tipos, tests,
scene:verify, build y audit:dist. 649 tests Node y 35 Python (684 total);
los tests Python no invocan Blender. API: 352; web: 210; schema/geometry: 48;
scripts: 39. `audit:dist`: 672 archivos, 0 fallos en la corrida registrada.
`audit:history`: PASS, 785 blobs / 8 commits previos a commits QA, 0 fallos.
Regresiones de invitaciones: 7/7 PASS. El launcher manual fue probado con
login UI y tap de Consumo en 320x740: PASS; al terminar elimino bases y
credenciales temporales. No se detectaron regresiones en los checks ejecutados. El gate completo de
la base antes de editar es NOT RUN; los bugs UI previos se acreditan con las
capturas y trazas de reproduccion, sin atribuirles fallos de otros gates. El SHA auditado final se registra junto
al paquete de evidencias.

En este environment se uso el binario instalado de pnpm 12 en `/tmp`; no es
necesario copiarlo a otro entorno que ya tenga el package manager del repo.
Los logs originales estan en `artifacts/qa-global-admin/`.
`results.json` y el reporte HTML son la fuente de verdad de la corrida final UI.

## Reproduccion y checklist manual

Node >=24, pnpm del repo, dependencias instaladas. Desde la raiz:

```sh
pnpm install --frozen-lockfile
pnpm qa:admin
# Alternativa sin checkout simulado:
pnpm qa:admin -- --disabled
```

El launcher imprime solo la URL loopback y el path del archivo local con
credenciales descartables `artifacts/qa-global-admin/demo-credentials.txt`
(modo 0600). Leerlo localmente. No hay credenciales reales o enlaces de
activacion productivos en el escenario. Incluye `admin@example.test`,
`admin2@example.test`, `standard@example.test` y `premium@example.test`.
Cada arranque crea bases nuevas. Ctrl-C apaga API/Vite y borra bases y archivo.
El escenario de demostracion tiene 26 intentos ficticios del admin y uno
standard; tokens/modelos son fixtures, no medicion de llamadas reales.

1. Abrir la URL de login en 320 y 430 px, luego desktop; entrar con admin.
2. Personas: crear personal y shared standard/premium; copiar enlace; revocar.
   En una ventana privada, activar una cuenta ficticia y comprobar aislamiento.
3. Standard: otorgar 25 con motivo; alternar premium/standard; suspender y
   reactivar. Con Standard en otra ventana, revocar sesiones y recargar.
4. Creditos: crear suscripcion mock, recargar antes de aprobar, simular el pago
   explicitamente; cancelar primero con No y luego Si. Comprar los dos packs.
   Verificar que no haya compras reales y que saldo no cambie solo al abrir.
5. Consumo: cambiar periodo/proveedor/estado, abrir llamadas, pasar pagina,
   actualizar. Ajustes > Consumo: cerrar con Escape y conservar el formulario.
6. Con Standard crear un proyecto privado manual y copiar su URL; abrirla con
   admin debe mostrar sin acceso. Standard no ofrece Invitaciones aunque tenga
   una suscripcion mock.

Automatizacion: [suite UI](../../apps/web/test/global-admin.browser.ts),
[fixtures](../../apps/web/test/global-admin-fixture.ts),
[configuracion](../../apps/web/playwright.admin.config.ts).
Para WebKit disponible en otra maquina:

```sh
pnpm --filter @t3-designer/web exec playwright install chromium webkit
T3_QA_WEBKIT=true pnpm test:admin
```

Trazas locales: `pnpm --filter @t3-designer/web exec playwright show-trace
<path-a-trace.zip>`. Reporte HTML: `artifacts/qa-global-admin/report/index.html`.
Los artefactos binarios estan ignorados por Git y se empaquetan aparte; los
tests, fixes y este informe quedan en commits locales.

## Pendientes y retorno para Atlas

**BLOCKED:** todas las recorridas WebKit por la descarga 403 citada.
**NOT RUN:** dispositivos fisicos, Firefox, otros idiomas en esta suite UI,
PostgreSQL, Mercado Pago sandbox/webhooks reales, latencia/offline prolongado
de un dispositivo fisico, email/recovery UI, generacion/3D, CRUD y sharing propios
del rol de proyectos, infraestructura/produccion y CI remoto.
El filtro por proyecto de Consumo se inventario; esta suite usa operaciones
sin proyecto, por lo que no acredita ese filtro con multiples proyectos.
La espera de cambio de mes premium se cubre por tests backend previos, no por
una espera real en navegador. Ningun hallazgo reproducido de esta tanda queda
sin correccion; estos limites no se presentan como cobertura absoluta.

La respuesta perdida de una invitacion puede dejar una fila activa sin que el
browser haya recibido el token; se puede revocar y crear otra. El token no se
recupera desde listados, conforme al contrato actual de mostrarlo una sola vez.
Esto sigue siendo una limitacion operativa documentada, no una promesa de
reintento transparente de invitaciones.

Archivos compartidos que requieren integracion entre ramas de roles:
`apps/api/src/accounts.ts`, `apps/web/src/private/AccountHub.tsx`,
`apps/web/src/private/account-copy.ts`, `apps/web/tsconfig.json`,
`package.json` y `docs/workflows/private-projects.md`.
Los tests/config/launcher nuevos son especificos del rol.

Retorno para integrar despues en Atlas: validacion local de cuentas globales en
el checkout portable GitHub y revision entregada; cinco bugs de cuentas/UI
corregidos; admin no adquiere acceso a proyectos privados ajenos; billing probado
solo disabled/mock; consumo con SQLite y datos sinteticos; Chromium emulado,
WebKit bloqueado. No cambia la evidencia historica de deploy 04/10 ni acredita
proveedor, pagos, restore o release actual. La wiki/retrospectiva de Atlas son
contexto fechado; implementacion y pruebas de esta tanda pertenecen a T3.
