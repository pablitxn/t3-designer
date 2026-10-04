# Apartment variants, finishes and lighting

The private project editor lets you explore a proposed apartment arrangement,
keep an alternative, and save both in the same project. Open a private project
at `/app/projects/<project-id>` after signing in. The public demo remains the
source template; editing a private project does not change it.

## What a version contains

There are three distinct concepts:

| Concept | Contains | Example |
| --- | --- | --- |
| Project | Access, notes, the asset catalogue, and all apartment variants | My T3 renovation |
| Apartment variant | Apartment architecture, proposed dividers, and furniture layouts | Bedroom with a dressing room |
| Furniture layout | Object instances, finishes, opening styles and light sources | Warm oak with curtains, or tile with white lighting |

Duplicate a **variant** before trying different walls. Its apartment and all
its layouts are copied independently. Duplicate a **layout** to try another
furniture arrangement with the same walls. A divider added to a variant appears
in every layout of that variant; it does not appear in other variants.

The project catalogue holds reusable asset references. An object in a layout
is an instance with its own ID, position, rotation and room reference. Copying,
moving or removing that instance does not edit its GLB or other instances.
Copies keep the exact catalogue model reference instead of following future
workshop revisions automatically.

Named variants and layouts are saved alternatives, not an immutable chronological
version history. The project API's numeric `revision` is a concurrency token.
Undo and redo are a separate, temporary editing history.

## Try an arrangement

1. Choose an apartment variant and a furniture layout. Enter a name under
   **Copy name** and duplicate the variant or layout when you want to keep the
   existing alternative.
2. Select an object in the scene or the **Placed objects** list. Drag it across
   the floor, or enter exact X, height and Z values in metres. Height is Y; the
   horizontal apartment plane is X/Z. Dragging preserves the object's height.
3. Choose a grid step for dragging, or select **Free**. The **Floor plan** view
   keeps the camera overhead; **3D** enables orbiting the scene.
4. Rotate, duplicate or remove the selected instance. A duplicate initially
   overlaps its source, is selected, and can be moved immediately.
5. For a generated object, add its selected workshop asset to the project
   through **Add from my assets**. Then choose it in **Project library** and
   place it in a room. Its model becomes available to the project's members.
6. To propose a divider, enter its two X/Z endpoints, height and thickness, then
   choose **Add divider**. Only dividers created by this editor can be removed
   with **Remove divider**.
7. Choose **Save changes**. Wait for the successful save message before closing
   the page. Reloading then opens the saved active variant and layout.

The UI is available in English, Spanish and French. The Spanish names for the
main controls are **Variantes del departamento**, **Distribuciones**, **Nombre
de la copia**, **Duplicar variante**, **Duplicar distribución** and **Guardar
cambios**.

## Compare finishes and light

Duplicate a layout to keep the original appearance before experimenting. The
customization panel is below the viewport and is available without WebGL too.

- **Walls and floors:** choose one wall or every wall, then a paint color. Choose
  a room or all rooms, then parquet, slate, ivory tile, entry tile or concrete
  and a color tint. Reset removes the override and restores the source finish.
- **Openings:** choose an existing door or window. Doors support paneled,
  glazed and passage styles, a finish color and an opening angle. Windows
  support casement, sliding and fixed frame representations. Add curtains,
  blinds or shutters, select their color and adjust closure. These appearance
  choices do not change the opening's position or dimensions.
- **Lighting:** toggle natural and artificial light independently. Add a fixed
  point in a room, give it a name, and edit its X/Y/Z location. Set brightness
  from 0 to 3,000 lumens and temperature from 1,800 to 6,500 K; warm, neutral
  and cool presets provide quick comparisons. Remove unwanted points.
- **Lamps:** place a model from the project library, select it, then enable its
  light emitter. Set its local X/Y/Z offset to the bulb location. The emitter
  moves and rotates with the object; removing the instance removes its light.
  The editor does not guess that an arbitrary model is a lamp from its name.
  An asset with authored `light` metadata supplies a default copied per instance.
- **Daylight:** choose a study date and time in the building's saved time zone
  and apply it. The same solar instant is used across layouts for comparison.
  Missing times at clock changes are rejected; repeated times require an
  explicit first/second occurrence. Changing it supports undo and project save.
- **Full walls:** enable this viewport option to inspect doors, frames and
  coverings at full height. The cutaway keeps the full physical shadow envelope.

All appearance and lighting changes participate in undo/redo and become durable
only after **Save changes** succeeds. Copying or switching layouts includes
these settings; viewers can inspect saved alternatives but cannot edit them.

Lighting is an approximate preview, not a calibrated lux, photometric or energy
study. Kelvin is mapped to an approximate display color; point lights emit in
all directions and have no manufacturer IES distribution. The source model and
material colors are estimates. Opaque coverings block direct light through their
covered portion; fabric translucency, bounce lighting and exposure differ from
real materials. Eight sources per layout, including disabled sources and lamp
emitters, bound rendering cost. A source must stay inside the apartment perimeter
and below its ceiling; this does not detect wall/fixture collisions.

These customizations are rendered by the browser's editor and project view.
The standalone Blender assembly scripts currently retain their own legacy
material/opening adapters and do not render these customization fields. They
must be updated before using Blender to compare the new finishes or lamps.

## Pointer and keyboard controls

| Action | Control |
| --- | --- |
| Select an instance | Click the object or its list entry |
| Move an instance | Select and drag; release to commit one move |
| Cancel a drag | Escape |
| Orbit | Drag empty space in the 3D view |
| Pan / zoom | Right-button drag / wheel |
| Nudge the selected instance | Arrow keys; Shift moves ten steps |
| Rotate the selected instance | R |
| Remove the selected instance | Delete or Backspace |
| Undo | Cmd/Ctrl+Z or the Undo button |
| Redo | Cmd/Ctrl+Shift+Z or the Redo button |

Focus the scene for movement, rotation and removal shortcuts. Undo/redo also
works while an action button has focus; text fields keep their native undo.
Typing in a form control does not move or delete objects. Nudging uses the grid
step, or 5 cm in Free mode.
Use the numeric inspector when a precise placement matters; a value commits
on blur or Enter. Undo/redo keeps up to 50 changes for the current editing
session and resets after a server reload or save. It is not stored as a project
revision history.
The inspector and lists remain usable when WebGL is unavailable, although the
interactive scene cannot render.

## Save contract and integration

`ProjectSnapshot` remains schema version 1. Its optional `editor` extension has
its own `schemaVersion: 1` and stores:

```text
editor
  activeArchitectureId
  architectures[]
    id, name, apartment, partitionWallIds[]
    activeLayoutId
    layouts[]
      id, name, fixtures[], customization?
```

A legacy snapshot without `editor` opens as one original variant with one
original layout. Editor actions return a complete snapshot through
`onChange(snapshot)`; the surrounding private workspace owns persistence and
passes `readOnly` for viewers, pending saves and conflicts.

The root `apartment`, `fixtures` and optional `customization` always materialize the active pair. The
editor also rebuilds root wall solids when architecture changes. Existing
renderers and exporters can therefore read the active geometry from the original
snapshot fields. Appearance adapters must also read `customization` and instance `light`
fields; older adapters do not acquire these features just by accepting the JSON. They do not implicitly export every saved alternative.
Validation checks inactive layouts too: all instances must reference a project
asset and a room in their own architecture.

The account/project service remains the only persistence boundary:

| Request | Contract |
| --- | --- |
| `GET /api/projects/:id` | Returns `{ project }`, including its full `scene` and current `revision` |
| `PUT /api/projects/:id` | Sends `{ revision, name, notes, scene }`; success returns the saved project and incremented revision |
| `409 Conflict` | The saved project changed since this draft was loaded; the draft is retained and saving is blocked |

After a conflict, **Load latest version** explicitly replaces the local draft
with the server's saved scene. There is no automatic merge or retry that can
overwrite someone else's changes. A successful response is the save boundary;
editing alone does not save to the server. This iteration has no independent
browser autosave or offline recovery store.

Authorization is enforced by the project API. A viewer may inspect the design
but cannot mutate it; hiding or disabling controls is only the UI layer. Asset
attachment uses project-scoped references checked by the account/project work.
Do not replace them with arbitrary external model URLs.

## Current limits

- Position validation keeps an object's origin inside the apartment perimeter
  and its declared height below the ceiling. It does not test the full rotated
  footprint, furniture-to-furniture collisions, wall collisions or clearance.
- Dividers must stay inside the apartment, be at least 20 cm long, have a
  thickness between 5 and 50 cm, and fit below the ceiling. They are proposed
  interior walls, not structural approvals.
- Adding a divider does not recalculate room polygons, room labels, reported
  areas, openings, electrical services or building structure. Existing source
  walls and openings remain protected from removal by this editor.
- The model is an approximate reconstruction. Moving furniture does not improve
  the certainty of its source measurements.
- The schema permits at most 32 apartment variants, 64 layouts per variant,
  2,000 instances per layout and 128 proposed dividers per variant. Copies use
  independent data; the API's 4 MiB request limit may be reached first.
- Model binaries are shared by reference. Variant duplication does not produce
  another GLB or Blender file, and editing does not rerun asset generation.

## Verification

From the repository root:

```sh
pnpm --filter @t3-designer/web exec playwright test e2e/editor.spec.ts e2e/editor-drag.spec.ts
```

The editor browser tests use an authenticated, mocked project API and the real
bundled scene. They check layout independence, variant-specific dividers,
movement and undo/redo, object duplication, private generated-model placement,
save/reload, read-only browsing and conflict recovery. The drag suite enables
real WebGL2 through Chromium's software renderer and checks pointer preview,
a single undo step per drop, snapping, preserved height, Escape cancellation,
keyboard focus, and desktop/mobile widths. Customization checks cover finishes,
opening styles, light-source persistence, viewer permissions, solar clock changes,
and real WebGL warm/cool/off comparisons and window coverings.

These tests do not establish live service authorization, deployment, model
fidelity or host-GPU compatibility. Schema/model tests and the account service's
integration tests cover the persistence and authorization contracts separately.
