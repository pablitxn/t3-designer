## Base de conocimiento compartida

Cuando el pedido requiera contexto, lectura, fuentes, relaciones, responsables,
decisiones o estado de un proyecto, app o repo del ecosistema, usar Atlas como
guia de navegacion aunque el pedido no lo mencione. Resolver `KB_ROOT` desde la
raiz Git de este proyecto, usando `../sysadmin-workspace` solo si ese mount
relativo existe en la sesion y apunta al repo esperado. Verificar
`KB_ROOT/AGENTS.md`, `KB_ROOT/atlas/AGENTS.md` y `KB_ROOT/atlas/catalog/` antes
de confiar en esa ruta.

Leer esas instrucciones y la skill pertinente antes del trabajo:

- Para contexto, lectura, fuentes, relaciones, owners o estado de un proyecto:
  abrir y leer `KB_ROOT/.agents/skills/atlas-navigate/SKILL.md`.
- Para una actualizacion o reconciliacion solicitada de la KB: abrir y leer
  `KB_ROOT/.agents/skills/atlas-maintain/SKILL.md`.

Si la skill no figura en el catalogo nativo, abrir y leer el archivo
explicitamente; este puntero no incorpora su contenido automaticamente. Un repo
vecino o co-montado no garantiza registro nativo. Si falta acceso, informar el
limite sin crear mounts ni instalar copias. El scope de la skill es instruccion:
los permisos ambientales y el mandato vigente rigen las acciones. Un pedido
sobre la KB no autoriza cambios en otros repos, Notion o runtime.
