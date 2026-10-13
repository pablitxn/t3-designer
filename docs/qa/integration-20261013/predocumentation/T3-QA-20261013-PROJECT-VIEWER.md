# T3-QA-20261013-PROJECT-VIEWER — Miembro viewer

Estado: **pendiente de consolidacion**. Esta ficha es predocumentacion en el repo del producto; no es una entrada aprobada ni un protocolo nuevo de Atlas.

Fuente primaria: [informe del rol](../../project-viewer-2026-10-13.md), [PR original](https://github.com/pablitxn/t3-designer/pull/7). Rama original `qa/t3-project-viewer-20261013`; SHA verificado `85d2374363ed94242f24fb2c6cfc262c94ce355c`. Base compartida `7a851eb7ab703016d78c102afeaac2a8d97b08f3`. Integracion `qa/t3-integration-20261013`; corte de codigo probado `657060b0b459753c2d52c0643357bc1dd732ba51` (consultar reporte para revision final y correcciones posteriores).

Correcciones: V01 revalidar revocacion; V02 ignorar respuestas de sesion fuera de orden; V03 sliders accesibles; V04 overlay/minimapa; V05 401 tardio de A revalida cookie actual B sin expulsarlo.

Decisiones al consolidar: Aislamiento ligado a cuenta y membresia; misma revision conserva planta/variante local; ningun permiso global premium concede escritura en proyecto compartido. Sliders/overlay toman mecanismo unico de anonimo.

Evidencia: Informe original: 54 UI (18x3); integracion las reejecuta. pnpm check del SHA fuente falla por enlaces a artifacts ausentes en checkout limpio, reproducido localmente; referencias convertidas a rutas de evidencia local. [Reporte integrado](../README.md). Los informes por rol son evidencia historica de sus propias revisiones; sus limites y fechas se mantienen. Capturas/trazas son archivos locales ignorados y se identifican por ruta/indice, sin afirmar que esten publicados en Git.

Pendientes y limites: WebKit bloqueado; Safari y telefonos fisicos, PostgreSQL y GPU fisica no ejecutados. Permisos premium/admin como viewer no cubiertos exhaustivamente en navegador; no inferirlos del rol de membresia.

Destinos Atlas propuestos, sujetos a revision posterior: `atlas/inbox/2026-10-13-t3-designer-qa-intake.md` para recepcion, `atlas/wiki/t3-designer.md` para estado sintetico, una entrada fechada en `atlas/entries/` para decisiones/evidencia y `atlas/catalog/sources.yaml` para las fuentes aprobadas. No actualizar deploy historico ni afirmar release/produccion con QA local. Atlas consultado en `27ae86c83cd4822e6f7c23c70a1b9397ffd39d9f`, sin escrituras en esta tanda.

Corte posterior de estabilizacion UI/renderer `67ad9ec8c1770788a7b6f34f34316bca67ccb26e`: pausa sin repaint continuo, captura de frame real con loop restaurado y transicion de salto observada desde antes del input. Evidencia y limites de CI en el reporte integrado; estado pendiente de consolidacion sin escrituras Atlas.
