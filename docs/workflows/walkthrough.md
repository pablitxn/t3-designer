# First-person apartment walkthrough

The walkthrough places the camera inside the active apartment at human eye
height. It uses the same project snapshot as the editor: architecture, the
selected furniture layout, model references, finishes, window coverings and
light sources. The public reference is available at `/#walkthrough`; private
projects launch it from **Walk through this version** (**Recorrer esta versión**
in Spanish).

## Start a visit

1. In a private project, select the apartment variant and furniture layout to
   inspect. Unsaved edits are included in the visit. Viewers can choose and
   visit saved alternatives without gaining editing permissions.
2. Choose **Walk through this version**. The visit panel identifies the project,
   variant and layout being shown. The public route identifies itself as the
   reference apartment.
3. Choose a starting room or leave **Safe entrance** selected. The controller
   searches for a free point with body and head clearance. A completely blocked
   room disables entry; choose another room or return to rearrange furniture.
4. Set the date and local time, eye height, field of view and mouse sensitivity.
   The time zone comes from the project. A nonexistent daylight-saving time
   disables entry; a repeated time uses its first occurrence and says so.
5. Enable the design's lights, an optional camera light, or on-screen controls
   as needed. **Enter the apartment** starts the visit and hides the settings
   panel until the next pause.

The pointer-lock request happens on the entry click. Once inside, moving the
mouse looks around without holding a button. If the browser refuses capture,
mouse movement over the canvas still controls the view; moving outside the
canvas stops turning, and re-entering establishes a fresh mouse position.
Keeping the cursor near an edge continues turning in that direction, so a
blocked pointer-lock request does not limit a visit to one screen's mouse travel.
Touchscreens retain drag-to-look. WebGL 2 is
required; an unsupported browser shows an explicit fallback and a working
return button instead of offering an unusable entry action.

## Controls

| Action | Control |
| --- | --- |
| Walk forward/back and sideways | W/A/S/D |
| Turn the camera left/right | Left/Right arrows |
| Look up/down | Up/Down arrows |
| Look around | Move the mouse; no button needs to be held |
| Walk faster | Hold Shift |
| Crouch | Hold C or Control |
| Jump | Press Space; release before the next jump |
| Open or close a nearby door | Look at its leaf and press E, or use the displayed action |
| Pause and release the mouse | Escape or **Pause** |
| Resume | **Resume walkthrough** |
| Touch movement and turning | Enable **On-screen controls**, then hold its buttons |
| Touch look | Drag the canvas |
| Touch jump | **Jump** in the on-screen controls |

Keyboard positions are physical, which preserves the same movement-key layout
across keyboard languages. Diagonal walking is normalized so it is no faster
than moving straight. Arrow keys control the camera's viewing direction without
moving the person through the apartment. Camera height changes smoothly without
head bob. Standing up checks clearance before raising the camera under a low obstacle. Jumping
raises the camera with vertical velocity and gravity, then lands on a supporting
surface or the floor. Holding Space does not repeatedly jump after landing.

When a door leaf is within reach and under the viewing direction, the visit
offers **Open door** or **Close door**. Press E once for each action; holding it
does not repeatedly toggle the door. Closed leaves block passage, and open
leaves keep their physical position and clearance. A move is refused when the
leaf would sweep through the person; step aside and try again. Doorways without
a leaf are passages and have no interaction. Windows are not interactive yet.

Losing browser focus, hiding the tab or releasing captured mouse control pauses
the visit and clears held input. Form controls keep their native keyboard
behavior. The minimap shows position and viewing direction; the status displays
the current room when the camera is inside a room polygon.

## What is temporary

The walkthrough does not call project persistence. Walking, opening doors,
changing the visit time, camera preferences, temporary light switches and restarting the visit do
not change the saved project or create undo entries. **Back to design** returns
to the same draft and selected version. Browser Back after launching from the
editor also returns to that selection.

Door positions start from the selected layout's saved openness; doors without
a saved value start open. Door actions affect this visit only. **Return to
start** restores the initial door positions as well as the starting camera.
Pausing preserves their current state and ignores E until the visit resumes.

Use the editor's **Save changes** action to retain design edits. A full browser
reload still discards an unsaved editor draft. A private `#walkthrough` URL opens
the server's saved active version after reload; the URL does not encode a
visitor's temporary layout selection or camera position.

Variants and layouts are named alternatives. They are distinct from immutable
historical revisions and from temporary undo/redo history; see
[the apartment editor workflow](apartment-editor.md).

## Geometry and lighting limits

- Movement stays inside the apartment perimeter. Jumping adds bounded vertical
  motion above the floor; it does not provide stairs, balcony exploration or
  object pushing.
- A normal jump peaks around 40 cm above its starting support and lasts about
  0.57 seconds when it lands at the same height. The head stops at ceilings and
  object undersides. Low furniture and wall tops can support a landing; walking
  off an edge falls to the next surface or the floor. There is no automatic step
  up or second jump in mid-air.
- Door leaves use the visit's current openness and retain their width, swing
  direction and header clearance. Windows and the exterior perimeter remain
  collision barriers, even when an exterior door is open.
- The body is an upright cylinder with a 20 cm radius. Walls use their actual
  plan segments; furniture uses each asset's rotated bounding dimensions, not
  detailed mesh geometry. A table's bounding box can therefore block space
  that appears open between its legs.
- Camera eye height is relative to the saved floor elevation. Default standing
  height is 1.65 m, crouch height is 0.95 m, with an additional 12 cm clearance
  above the eyes. Movement uses bounded substeps to prevent crossing a wall
  during a slow frame.
- Finishes and model references come from the selected snapshot. Failed model
  loads leave a visible box at the asset's declared dimensions so the missing
  object is not silently removed from the visit.
- Sun position uses the site's coordinates, time zone and orientation.
  The artificial-light switch starts with the saved master setting and can
  temporarily override it. Each light retains its own saved enablement and
  properties. Lighting remains an approximate
  visual study rather than calibrated photometry or a measured survey.

## Verification

Run navigation unit tests from the repository root:

```sh
pnpm --filter @t3-designer/web test
```

All browser tests run locally before publication. CI runs quality, image
publication and runtime smokes. The main browser suite separates
`pnpm test:e2e:fast` (currently 54 tests) from tests tagged `@webgl`. The five
rendered walkthrough tests belong to the 12-test WebGL suite. Run it on the
local development host, with an unused port:

```sh
T3_E2E_PORT=4207 pnpm test:e2e:webgl
```

For focused walkthrough work, run both its fast and rendered tests locally:

```sh
T3_E2E_PORT=4207 pnpm --filter @t3-designer/web exec playwright test e2e/walkthrough.spec.ts --workers=1
```

The browser suite checks the public route and WebGL fallback, an unsaved owner's
draft, a viewer's selected alternative, absence of persistence requests, actual
rendered WASD movement, arrow-key camera rotation without translation, mouse
look without holding a button, pointer-lock
acquisition and denial fallback, pointer re-entry, perimeter collision,
Escape/blur cleanup, one jump per Space press, landing, the on-screen jump
control, local door interaction and collision, reset restoration and
desktop/mobile layout. It uses Chromium's software
WebGL renderer; the first shader compilation can be slower than a hardware GPU.
Running these tests locally on a Mac does not imply hardware GPU rendering.
Inspect the UI and attached captures, and retain the source revision, command
and result as release evidence. After rollout, verify the public walkthrough's
rendered desktop/mobile UI and affected interactions against the deployed build.
CI status and a visible canvas alone do not establish visual correctness.

`pnpm test:e2e` still runs all 66 main browser tests locally. Before publishing,
run `pnpm check:all`, which also includes quality, the 31-test analytics suite
and the real account/project flow. Equivalent separate runs are acceptable when
their evidence covers the same application source revision. CI does not verify
completion of local browser checks. See
[deployment](../deployment.md#build-and-release) for the release workflow.

Private interaction fixtures render the real WebGL scene in a 640 × 480 canvas.
They retain the target building, apartment, doors, furniture needed by the
scenario, and normal solar/artificial lighting. They omit neighbouring buildings
and roads, which do not participate in interior collision. The door fixture
opens toward the visitor so the blocked-opening check intersects the actual
leaf sweep. The furnished public reference keeps its full site and assets and
the normal desktop/mobile canvas sizes, including a resize of the same visit.
These fixture choices do not change application rendering or navigation.

Continuous trace screenshots are disabled to avoid running a second screencast
alongside software WebGL and the explicit PNG captures. Failure traces retain
actions, DOM snapshots, sources and network records; the active walkthrough and
public desktop/mobile PNGs remain attached. Normal local tests allow 90 seconds
per scenario. Additional headless diagnostic budgets remain in the test code,
but browser tests do not run in CI. Movement, camera,
collision and landing checks remain required; the door fixture's approach
positions match its swing toward the visitor, with explicit checks outside and
inside that arc. The controller caps each simulation step, so slow software
frames require more wall-clock time to cover the same distance;
longer budgets do not advance the simulation artificially.

The native-capture test first requests pointer lock on an ordinary visible DIV
using a real button click. It skips with an explicit reason only when that probe
returns `WrongDocumentError`, which some headless hosts return for the entire
document. If the probe succeeds, the walkthrough must become active, acquire
native capture on its canvas and release it on Escape. While capture is held,
the test dispatches a synthetic relative `mousemove` event with explicit X/Y
deltas and verifies both yaw and pitch in the rendered pose. This exercises the
captured-input handler; it does not claim to automate a physical mouse. A plain
DIV diagnostic on headless Chromium 153 reproduced equal and opposite trusted
deltas for each Playwright/CDP absolute mouse move under pointer lock, cancelling
the intended motion; unlocked moves retain their expected net delta. Real
Playwright pointer movement still covers hover and capture-denial fallback
independently.
