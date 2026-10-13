# T3-QA-20261013-PROJECT-OWNER — Propietario de proyectos

Estado: **pendiente de consolidacion**. Esta ficha es predocumentacion en el repo del producto; no es una entrada aprobada ni un protocolo nuevo de Atlas.

Fuente primaria: [informe del rol](../../owner-20261013.md), [PR original](https://github.com/pablitxn/t3-designer/pull/5). Rama original `qa/t3-owner-20261013-cloud`; SHA verificado `bc01ee5b98f858784353d533ac957944706af199`. Base compartida `7a851eb7ab703016d78c102afeaac2a8d97b08f3`. Integracion `qa/t3-integration-20261013`; corte de codigo probado `657060b0b459753c2d52c0643357bc1dd732ba51` (consultar reporte para revision final y correcciones posteriores).

Correcciones: OWNER-B01 ancho minimo del aside; OWNER-B02 descarte al cancelar historial; OWNER-B03 confirmacion de costo y clave estable al responder preguntas de muebles.

Decisiones al consolidar: Guard de historial unificado con editor. Mocks deterministas queued/running/success/needs-input/failed/cancelled/retry mediante servicios reales, sin proveedores ni Blender. Bloqueados fuera de development, loopback y carpeta owner-qa.

Evidencia: Informe original: 54 combinaciones consolidadas en varias tandas, 3 WebGL con GLB existente, 180 regresiones y 1 smoke de entrada real. Integracion: nueva matriz, sin trasladar esos PASS automaticamente. [Reporte integrado](../README.md). Los informes por rol son evidencia historica de sus propias revisiones; sus limites y fechas se mantienen. Capturas/trazas son archivos locales ignorados y se identifican por ruta/indice, sin afirmar que esten publicados en Git.

Pendientes y limites: WebKit bloqueado; calidad 3D, inferencia, modelado/render Blender, pagos y produccion no validados.

Destinos Atlas propuestos, sujetos a revision posterior: `atlas/inbox/2026-10-13-t3-designer-qa-intake.md` para recepcion, `atlas/wiki/t3-designer.md` para estado sintetico, una entrada fechada en `atlas/entries/` para decisiones/evidencia y `atlas/catalog/sources.yaml` para las fuentes aprobadas. No actualizar deploy historico ni afirmar release/produccion con QA local. Atlas consultado en `27ae86c83cd4822e6f7c23c70a1b9397ffd39d9f`, sin escrituras en esta tanda.

Hallazgo adicional de integracion INTEGRATION-B01: el replay StrictMode retenia el controlador abortado y retrasaba la conexion inicial. Corregido limpiando la referencia; regresion contra app base con polling retrasado, mas recorridos reales y suites afectados reejecutados. Ver reporte integrado para resultados y limites.
