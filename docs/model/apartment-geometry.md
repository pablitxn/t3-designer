# Apartment geometry — current visual reconstruction

The proportional source image reports room areas, not surveyed wall lengths.
This revision uses the eleven photographs and four videos indexed in
[`../reference/evidence.md`](../reference/evidence.md) to correct topology and add observed details. All linear
coordinates, heights, widths and object placements are still estimated.

## Geometry

| Zone | Reported area m² | Estimated bounding span X × Z, m |
| --- | ---: | ---: |
| Chambre 1 | 11.81 | 3.374 × 3.500 |
| Chambre 2 | 9.32 | 2.663 × 3.500 |
| Salon / séjour | 16.39 | 3.402 × 4.818 |
| Entrée | 2.26 | 2.200 × 1.027 |
| WC | 0.87 | 0.720 × 1.208 |
| Salle d’eau | 3.21 | 2.200 × 1.855 |
| Cuisine | 4.26 | 2.200 × 1.936 |
| Placard | 1.06 | 1.100 × 0.964 |

The bathroom is L-shaped; its bounding rectangle includes the separate WC.
Conceptual room polygons tile the perimeter and preserve the reported49.18m².
Walls are centered on their boundaries, so clear rendered floor area is smaller.
Balcony area1.26m² and basement8.54m² are reported outside Carrez. Basement shape
is unknown and is not modeled.

Compared with the first schematic reconstruction: service-strip width is2.20m
instead of2.65m, allowing a1.936m kitchen short span for the observed U-shaped
cabinetry. This yields about0.53m at the narrow fridge passage with these asset
estimates; it is not a measured clearance. Bedroom portals now have a broad
intervening pier. Wall height is estimated2.70m to allow the observed utility
cabinet above the entry portal. Exterior walls0.18m, interior walls0.10m.

## Openings and evidence

- Bedroom portals and hall/living/bath passages have visible profiled casings.
- The WC leaf opens outward, supported by P03. Its55cm estimate fits this narrow
  reconstructed zone; actual width must be measured.
- The closet panel has an irregular hole based on P09.
- V04 confirms a cased kitchen passage and white glazed balcony access.
- Two bedroom casements, kitchen casement and balcony French doors are modeled.
  Presence/type is observed; offsets, widths, heights and sill levels are inferred.
- Doorway dimensions and exact hidden hinge sides remain provisional.

## Coordinate and asset contract

Plan [X,Z]: +X east, +Z south; +Y is height. North follows the schematic arrow.
One unit is one meter. Blender position is (web X, -web Z, web Y).
Architecture stays in t3.ts; fixture library and instances in current-state.ts.
JSON files are generated exports for review and Blender assembly.

## Unresolved calibration

Exact dimensions, true room shapes, wall thicknesses and ceiling heights require
a survey. Bathroom vanity/washer adjacency is observed, but the old plan does not
constrain the shower/glass-block arrangement well enough for an exact replica.
The modeled partition is provisional and has been placed without intersecting
fixture volumes; do not infer a verified circulation layout from it. Window guard
and balcony rail spacing are estimated. Materials and wear are visual approximations.

## Verification

Automated checks cover valid IDs/units, area tiling, aperture bounds and overlap,
wall solid-area conservation, JSON serialization, asset GLB structure/catalog
dimensions, fixture references/heights and nominal fixture-volume intersections.
These establish software consistency, not photographic or survey accuracy.
