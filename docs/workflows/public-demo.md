# Public demo: furniture placement and object history

The public `/` application works without an account or workshop API. Open
**Apartment → Rearrange furniture** to edit the demo layout. Select furniture in
the 3D scene or object list, then drag it, rotate it or adjust its X/Z coordinates.
The plan starts from above; the 3D button switches to perspective. The list and
numeric controls remain available when WebGL is unavailable.
The rearrangement view uses neutral editing light for visibility; the normal
apartment view and walkthrough retain their solar lighting controls.

## Placement and persistence

- Asset/fixture `mobility` metadata distinguishes movable furniture from fixed
  installations; see [asset mobility](asset-mobility.md). The published fridge,
  microwave and low table can move. Plumbing, fitted cabinets, heating and other
  installations stay in place. Both pointer handling and state edits enforce it.
- Public edits preserve object identity, assets, elevation and architecture.
  Movement snaps to 10 cm; arrows move 10 cm, Shift+arrows 50 cm, R rotates 90°.
  Escape cancels an active drag. A completed drag is one undo step. Ctrl/Cmd+Z
  and Ctrl/Cmd+Shift+Z undo/redo up to 50 in-session edits.
- The normal apartment view and walkthrough use the same modified fixtures.
  The building/site reference and downloadable baseline snapshots remain canonical.
- Only changed public fixture positions/rotations are stored, under
  `t3-designer.demo-layout.v1`. No private project, model URL, free text or account
  identifier is written. Public edits are never sent to the API or analytics.
- Reload restores the layout; same-origin tabs synchronize changes. The most
  recent completed edit wins. Undo/redo history is not persisted and is reset
  when another tab changes the layout.
- **Restore original layout** removes only that key and restores canonical
  placements. It preserves language, theme, consent and all unrelated storage.
  Reset itself can be undone during the current session.
- Invalid JSON, unsupported versions, unknown/fixed objects, non-finite values
  and outside-room placements are rejected. Each saved override includes its
  original placement; if a future release changes that baseline, the stale
  override is ignored and the UI reports recovery.
- Storage denial/quota errors leave the editor usable and visibly report that
  changes are temporary. They never claim successful persistence.

This is an approximate arrangement tool. It checks object centers against room
polygons, not full furniture footprints, collision-free paths, service connection
reach or access clearances. Moving furniture does not establish feasibility of
physical installation.

## Curated public history

`/#assets` contains published examples from the local workshop: STRANDMON,
DYVLINGE and FÅGELFJÄLLET. DYVLINGE exposes its two actual saved versions;
internal generation attempts are not invented as additional versions. The
current DYVLINGE result remains marked for visual correction. All examples are
draft reconstructions rather than manufacturer-certified models.

`apps/web/src/data/public-assets.ts` is the allowlisted public metadata; ES/EN/FR
descriptions explain provenance and limitations. `apps/web/public/demo-assets/`
contains selected model GLBs, perspective/front/side PNGs and a hash catalog.
Public files omit private identifiers, raw prompts, jobs, uploaded references,
account data, source requests and workshop logs. The gallery does not call
`/api/assets`, `/api/jobs` or any other private API.

The create/sign-in links target `/app/assets`; project links target `/app`.
Existing authentication returns visitors to their requested destination after
login. Public layouts do not silently become private projects. Private project
creation, architecture/layout alternatives and server persistence retain their
existing behavior. Production account invitations and generation availability
remain controlled by the [deployment configuration](../deployment.md).

## Verification

Run `pnpm check`, then the public browser tests:

```sh
T3_E2E_PORT=4193 pnpm --filter @t3-designer/web exec playwright test \
  e2e/demo-layout.spec.ts e2e/demo-drag.spec.ts e2e/public-assets.spec.ts --workers=1
```

`demo-drag.spec.ts` uses real SwiftShader WebGL and pointer events in plan and
perspective. `demo-layout.spec.ts` covers persistence, undo/redo, reset, locked
installations, invalid positions, denied storage, tab synchronization and mobile
overflow. Gallery tests verify available revisions, login boundary, languages and
mobile layout; unit tests verify packaged hashes and allowed files.

Before publishing the combined release, also run the full E2E, analytics and real
account suites described in [deployment](../deployment.md). After publication,
verify the actual public pages and assets, local reload/reset, and anonymous 401
responses on private APIs. A successful local build alone is not a deployment.
