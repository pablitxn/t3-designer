# Building and sunlight: reusable implementation checkpoint

This technical summary replaces a case-specific authoring record. The original
operational evidence is outside the public software repository. Current state
must be verified from code and tests, not inferred from this historical note.

## Preserved scene and interaction

The context has 99 building volumes and 27 road segments in local metre units
(X east, Y up, Z south), a parcel outline and courtyard holes. The demo keeps the
authored facades, roof assumptions, interior placement, cutaways, orbit controls,
neighbors and directional shadows. Identifiers and location labels are now
local demonstration values; the approximate regional solar origin does not
locate the preserved footprints.

`building-site.ts` owns the contextual geometry. `apartment-placement.ts` owns
the shared apartment transform. Building cutaways preserve floor and roof shadow
casters. Scene bounds, roof ranges, uncertainty and polygon topology retain their
separate meanings. Dates use `Europe/Paris`, including daylight-saving behavior.

## Reproduce

1. Run `pnpm dev:web` and open `http://127.0.0.1:5173/#building`.
2. Exercise top/3D views, neighbors, labels, floor/interior cutaways and solar presets.
3. Run `pnpm scene:snapshot` and `pnpm scene:verify` for deterministic shared inputs.
4. Use `pnpm blender:render` for a separate background process; set `BLENDER_BIN`
   for a nonstandard installation.
5. Inspect screenshots and the rendered geometry. A passing command alone does
   not establish visual fidelity or measured accuracy.

## Limits

Local geometry and approximate dimensions are preserved, not guaranteed
anonymous against shape matching. Ground is flat; terrain, distant obstacles,
vegetation and clouds are outside the direct-light model. Windows, floor index,
interior fit and orientation are authored estimates rather than a survey.

See [building provenance](../research/building-research.md),
[solar method](../model/solar-model.md) and
[apartment placement](../model/apartment-placement.md).
