# Checkpoint: departamento, sol y pipeline reproducible — 27/09/2026

Esta iteración integra el T3 al edificio, conecta el sol del interior y revisa la
arquitectura antes de seguir agregando funcionalidades. El checkpoint previo está
preservado en [edificio y sol](t3-building-sun-v1.md), correspondiente
al commit `f697996`; el interior original sigue en
[estado inicial del T3](t3-current-state-v1.md), commit `5e45d4e`.

## Estado implementado

- T3 identificado dentro del edificio con cortes de piso e interior. Registro
  provisional según la marca y foto del usuario: tercer piso, cota 9,30 m,
  living hacia SO y habitaciones hacia NE. No es una ubicación medida.
- Fecha/hora de the regional example compartida entre ambas vistas, presets estacionales,
  reproducción del día y enfoque por habitación. El edificio puede ocultarse en
  la vista interior conservando su efecto sobre las sombras.
- Muros completos, techo y contexto físico continúan proyectando sombras cuando
  están cortados para la cámara. Aberturas segmentadas y vidrio transmisivo.
- `App` reducido a composición y estado compartido. Exploradores, controles
  solares, estado del departamento, cámara y materiales de sombra están separados.
  Ambos visores dibujan bajo demanda; al volver de reposo la cámara interpola sin
  saltar y termina de mover tanto su posición como su punto de enfoque.
- Contrato de escena completo versionado y exportador determinista. Blender puede
  reconstruir el conjunto desde archivos del repo con su GUI cerrada.

## Datos y recuperación

Las fuentes de verdad y las reglas para extenderlas están en
[architecture.md](../architecture/architecture.md). Los datos editables siguen bajo
`apps/web/src/data`; el schema y la geometría pura están en `packages/`.

`pnpm scene:snapshot` genera los JSON de escena y expediente y `pnpm scene:verify` detecta si quedaron
desactualizados. El principal es `assets/scenes/t3-project.json`: departamento,
assets, ubicación, muros segmentados, pisos/techo, contexto y sol. El instante de
referencia es **26/09/2026 a las 15:00 Europe/Paris**, fijado para producir diffs
estables. La fecha de la web es independiente de esta instantánea guardada.

Los cuatro `.blend` históricos y los 19 GLB (18 del catálogo y un marco de muestra)
permanecen versionados. La nueva escena combinada se genera en
`artifacts/blender/t3-project.blend`; incluye el JSON, metadatos solares y recursos
de imagen empaquetados. El nuevo adaptador evita sobrescribir los `.blend`
históricos. Su PNG y los informes detallados quedan bajo `artifacts/`, ignorado
por Git porque se pueden reproducir.

El pipeline usa Blender instalado en segundo plano. No necesita MCP, add-on,
Blender abierto ni fotografías originales para ensamblar/renderizar. Los medios
originales siguen fuera del repo y no se usaron como texturas privadas.

## Validación

- `pnpm check`: lint, TypeScript, **77 pruebas** (35 web, 6 geometría, 6 schema,
  10 exportación y 20 Python), verificación de los snapshots generados y build.
- Las pruebas cubren aperturas, transformaciones, áreas, referencias de assets,
  fuente astronómica independiente, cambios horarios, entrada inválida, detección
  de snapshots desactualizados y restauración de materiales compartidos.
- Navegador con WebGL: invierno a las 15:00, foco del living después de reposo,
  rótulos, contexto, corte del edificio e ida/vuelta conservando fecha, hora y
  selección. Sin errores de consola en esa sesión; persiste el aviso upstream
  sobre `THREE.Clock`.
- Auditoría de persistencia: cinco `.blend` reabiertos en procesos independientes
  (cuatro históricos y el nuevo combinado) y 19 GLB válidos. Sin recursos de render
  faltantes ni cambios de bytes causados por la auditoría. Una biblioteca opcional
  de pinceles de Blender corresponde a herramientas de edición, no al render.
- Render real Cycles CPU a **960 px / 32 muestras**: 21 instancias de equipamiento,
  contexto de 99 edificios, dirección solar verificada (error angular 0) y cortes
  que conservan las sombras. Escena guardada reabierta con cámara activa, un sol,
  JSON embebido y sin recursos externos. Los informes están en
  `artifacts/reports/assets.json`, `artifacts/reports/generated-scene.json` y
  `artifacts/blender/t3-project.validation.json`.

El build conserva el aviso del bundle Three.js grande: aproximadamente 1,47 MB
minificado / 409 kB gzip. No se ocultó aumentando el límite del aviso.

## Próximas extensiones

La base permite crear un adaptador de trabajos de render, presets de cámara,
comparaciones estacionales y variantes de diseño. Todavía no hay cola de renders
integrada a la interfaz ni animación de la nueva escena Blender: esta usa el
instante seleccionado y guarda las muestras diarias para una futura extensión.

Geometría y dirección solar son compartidas; materiales, brillo, decoración y
algunos detalles visuales dependen del renderer. No asumir igualdad de píxeles
entre web y Blender ni tratar los `.blend` históricos como la escena actual.
Las medidas, ventanas, encaje y orientación siguen siendo estimados. Ver
[ubicación](../model/apartment-placement.md) y [límites solares](../model/solar-model.md).

## Retomar

```sh
pnpm check
pnpm dev
pnpm blender:validate
pnpm blender:render
```

Abrir `http://localhost:5173/#apartment`. Para cambiar la fecha del render sin
reescribir la referencia versionada, exportar con `--output` y pasar ese archivo
con `--input`; los ejemplos están en [blender.md](../workflows/blender.md).
