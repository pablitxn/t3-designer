# Asset mobility

Each reusable scene asset and each placement can declare `mobility: 'fixed' | 'movable'`. The placement value takes precedence, so a reusable model can be installed in one location and movable in another. This describes what furniture arrangement controls allow; it is not a surveyed installation assessment.

The source catalog and placements live in `apps/web/src/data/current-state.ts`. Their baseline classifications are explicit:

| Arrangement | Objects |
| --- | --- |
| Movable | Fridge/freezer, countertop microwave, low table |
| Fixed | Toilet, sink and vanity, shower and glass screen, kitchen cabinets, combined oven/cooktop, plumbed washing machine, hood, boiler, radiators, towel radiator, bathroom mirror, electrical panel |

Fixed elements can be selected and inspected. Furniture arrangement cannot move, rotate, change their room, duplicate or remove them, or place extra fixed installations from the furniture catalog. Architecture and layout copies preserve them. Finishes and light settings are separate from this movement permission.

`getAssetMobility`, `getFixtureMobility` and `isFixtureMovable` in `@t3-designer/scene-schema` provide the shared policy used by scene controls and editor operations. Do not infer mobility from translated names or maintain a second UI-only classification.

## Existing projects and new assets

The optional metadata keeps schema-v1 saved projects readable without rewriting their JSON. When it is absent, the original catalog IDs receive the same baseline classification. Existing private furniture models with an exact project-scoped model URL retain movable behavior. All other unclassified models default to fixed until their author declares mobility.

New imported private furniture explicitly records `mobility: 'movable'`. New catalog entries must include their intended value, and new placements copy the effective value. Model URLs, project authorization, source evidence and revision semantics are unchanged.

After changing the canonical catalog, run `pnpm scene:snapshot` and `pnpm scene:verify` to update and check the published snapshot data. The classification requires no GLB or Blender regeneration because it changes arrangement behavior, not model geometry.

## Verification

Run `pnpm --filter @t3-designer/scene-schema test` and `node --test apps/web/test/editor-model.test.ts apps/web/test/project-scene.test.ts apps/web/test/customization-model.test.ts`. Coverage includes metadata serialization, legacy snapshots, explicit placement overrides, unknown-model defaults, fixed-object mutation rejection, and isolation across project variants and layouts.
