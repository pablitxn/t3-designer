# T3-QA-20261013-GLOBAL-ADMIN — Administrador global

Estado: **pendiente de consolidacion**. Esta ficha es predocumentacion en el repo del producto; no es una entrada aprobada ni un protocolo nuevo de Atlas.

Fuente primaria: [informe del rol](../../2026-10-13-global-admin.md), [PR original](https://github.com/pablitxn/t3-designer/pull/4). Rama original `qa/t3-global-admin-20261013`; SHA verificado `07d9c16e7707ed10cfdae3f592030ba27f76aa94`. Base compartida `7a851eb7ab703016d78c102afeaac2a8d97b08f3`. Integracion `qa/t3-integration-20261013`; corte de codigo probado `e4cb70fed850f5460b8a116e1e62177869fc9d9c` (consultar reporte para revision final y correcciones posteriores).

Correcciones: B01 validacion trimmed de motivos; B02 ocultar suspension de otros admins; B03 recuperar checkout mock pendiente tras reload; B04 cupo atomico personal/shared y rol actualizado; B05 textos largos en mobile.

Decisiones al consolidar: El rol admin global no da acceso a proyectos ajenos. Billing solo disabled/mock; cupo de invitaciones bajo transaccion y revalidacion del invitador.

Evidencia: Informe original: 42 UI en tres perfiles y regresion concurrente de cupo. Integracion: ver matriz y check de 658 Node. [Reporte integrado](../README.md). Los informes por rol son evidencia historica de sus propias revisiones; sus limites y fechas se mantienen. Capturas/trazas son archivos locales ignorados y se identifican por ruta/indice, sin afirmar que esten publicados en Git.

Pendientes y limites: WebKit bloqueado; recovery UI, PostgreSQL, pagos/webhooks y correo real sin ejecutar. Respuesta perdida de invitacion requiere revocar/recrear el token de una sola entrega.

Destinos Atlas propuestos, sujetos a revision posterior: `atlas/inbox/2026-10-13-t3-designer-qa-intake.md` para recepcion, `atlas/wiki/t3-designer.md` para estado sintetico, una entrada fechada en `atlas/entries/` para decisiones/evidencia y `atlas/catalog/sources.yaml` para las fuentes aprobadas. No actualizar deploy historico ni afirmar release/produccion con QA local. Atlas consultado en `27ae86c83cd4822e6f7c23c70a1b9397ffd39d9f`, sin escrituras en esta tanda.
