# Building context: reusable geometry and provenance

The public dataset is a **generalized demonstration**, prepared on 2026-10-04.
Its local building and road geometry is retained so existing authored scenes,
shadow studies, models and exports remain reusable. It is not an official
property record or a survey of the demonstration location.

## What is preserved

`apps/web/src/data/building-site.ts` holds 99 building footprints, 27 road
segments, a demonstration parcel, roof ranges, heights and uncertainty metadata.
Courtyard holes remain holes. The apartment uses the same local registration,
wall dimensions and room-area values as before generalization. No geometry was
scaled, moved relative to other geometry, or discarded during this separation.

The frame uses metres: X east, Y up, Z south. Polygons are open rings without a
repeated closing vertex. Height describes the modeled eaves/perimeter; the roof
range is a separate vertical difference and does not determine a roof shape.
Ground altitude and relative ground offset have different meanings. The current
renderer uses a flat ground plane, so this is not a terrain survey.

## What was generalized

External building, road, address and cadastral identifiers were replaced with
local `demo-*` identifiers. Street names, postal address, direct map links and
case-specific source responses were removed from the public dataset. The solar
origin is an **approximate regional reference at 48° N, 4° W**, with the
`Europe/Paris` time zone. It does not geolocate the preserved footprints.

Preserving distinctive geometry means this is **not a guarantee of anonymity**
against geometric matching. The separation removes direct lookup associations;
it does not claim to make an identifiable shape unrecognizable.

## Source attribution and transformations

Original geographic research was consulted on 2026-09-26 and 2026-09-27.
Retained derived geometry is adapted from **© IGN · BD TOPO / BAN · DGFiP
cadastre · RNB — Licence Ouverte 2.0**. Keep the attribution, original retrieval
dates, transformation description and applicable dataset terms with copies.
The public demo replaces identifiers and geolocation, not upstream ownership.

- [IGN BD TOPO documentation](https://geoservices.ign.fr/bdtopo)
- [RNB data governance](https://rnb.beta.gouv.fr/gouvernance-donnee)
- [Open cadastral data](https://cadastre.data.gouv.fr/)
- [BDNB documentation](https://bdnb.io/documentation/accueil_documentation/)

The contextual year, dwelling count and material values are retained only as
illustrative dossier values. They no longer claim to describe a publicly
identified building. BDNB and cadastral entities are different from apartments,
legal lots or ownership. Visual reconstruction details remain authored estimates.
No Google Maps/Earth meshes or textures are redistributed.

## Applying the method to another authorized dataset

1. Establish the permissions and publication scope before collecting references.
2. Keep address, building, parcel, group and legal-lot identities distinct.
3. Record source, retrieved date, original record date, field and uncertainty.
4. Project geographic geometry into a metric local frame and preserve holes.
5. Record inferred openings, roof form, materials and placement as estimates.
6. Keep private documents and raw location-specific responses outside the public
   software repository and static frontend. Publish only reviewed derivatives.
7. Validate polygon topology, metre scale, source meanings and rendering; a
   correct mesh does not certify its correspondence with a real property.

`pnpm scene:snapshot` regenerates the demo snapshots; `pnpm scene:verify` checks
that the exported geometry, dossier and solar inputs match canonical sources.
