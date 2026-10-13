# T3-QA-20261013-SHARED-EDITOR — Editor de proyecto compartido

Estado: **pendiente de consolidacion**. Esta ficha es predocumentacion en el repo del producto; no es una entrada aprobada ni un protocolo nuevo de Atlas.

Fuente primaria: [informe del rol](../../shared-project-editor-2026-10-13.md), [PR original](https://github.com/pablitxn/t3-designer/pull/6). Rama original `qa/shared-project-editor-20261013`; SHA verificado `7fe34e94419fe4c074937072dc55f85d5b216f3e`. Base compartida `7a851eb7ab703016d78c102afeaac2a8d97b08f3`. Integracion `qa/t3-integration-20261013`; corte de codigo probado `657060b0b459753c2d52c0643357bc1dd732ba51` (consultar reporte para revision final y correcciones posteriores).

Correcciones: Cancelar Atrás/Adelante/link/logout conserva borrador; 403/404 retiran editor; downgrade refresca permiso viewer; respuestas abortadas o guardados tardios no cambian otro proyecto.

Decisiones al consolidar: Un solo evento t3:before-navigate en App/ProjectEditor. Integracion agrega revalidacion compartida: cambio de revision conserva borrador hasta conflicto; cambio de rol retira controles y borrador no autorizado.

Evidencia: Informe original: 45 casos compuestos (15x3), mas regresiones; integracion agrega 2 casos x3 y reejecuta 51 combinaciones. Historia del SHA fuente falla audit:history por ruta personal en borrador anterior; el tip final no se usa como ancestro. [Reporte integrado](../README.md). Los informes por rol son evidencia historica de sus propias revisiones; sus limites y fechas se mantienen. Capturas/trazas son archivos locales ignorados y se identifican por ruta/indice, sin afirmar que esten publicados en Git.

Pendientes y limites: WebKit bloqueado. Reporte remoto detallado 403; diagnostico local de historial confirmado. Inferencia, Blender, infraestructura, PostgreSQL no ejecutados.

Destinos Atlas propuestos, sujetos a revision posterior: `atlas/inbox/2026-10-13-t3-designer-qa-intake.md` para recepcion, `atlas/wiki/t3-designer.md` para estado sintetico, una entrada fechada en `atlas/entries/` para decisiones/evidencia y `atlas/catalog/sources.yaml` para las fuentes aprobadas. No actualizar deploy historico ni afirmar release/produccion con QA local. Atlas consultado en `27ae86c83cd4822e6f7c23c70a1b9397ffd39d9f`, sin escrituras en esta tanda.

Corte posterior de estabilizacion UI/renderer `67ad9ec8c1770788a7b6f34f34316bca67ccb26e`: pausa sin repaint continuo, captura de frame real con loop restaurado y transicion de salto observada desde antes del input. Evidencia y limites de CI en el reporte integrado; estado pendiente de consolidacion sin escrituras Atlas.
