# Demonstration property dossier

The public **Property details** view is a complete **fictional 2026 scenario**,
reviewed 2026-10-05. Its five sections cover overview, apartment, building,
energy and surroundings, and sources, with search and evidence cards.
“Résidence du Jardin · Quimper” is an invented residence; its sample values
do not identify a real property, legal lot, diagnosis or owner.

## Content contract

- `apps/web/src/data/dossier.ts` defines the fictional scenario, model facts and
  visual inventory. Room areas share the canonical apartment values rather
  than a separate measurement table. `dossierQuestions` is empty.
- `apps/web/src/data/building-site.ts` supplies local geometry and demo IDs.
- `apps/web/src/data/demo-location.ts` supplies the public Place Saint-Corentin
  map reference in Quimper. It does not locate the fictional residence or the
  reconstructed building. Solar calculations retain their separate regional
  reference at 48° N, 4° W, in the Europe/Paris time zone.
- `/dossier/demo-evidence.json` is generated from the example facts. It is not an
  archive of official HTTP responses or evidence of a real property.
- `/dossier/apartment-plan.png` is a public model-rendered plan. Its geometry and
  area values are illustrative, without an address or diagnosis identifier.
- `/dossier/reference-evidence.md` describes the reusable model and its limits.

The model source `demo-scenario` supplies the invented residence name, DPE D,
6,200 kWh of final energy use and a €900–1,200 energy budget for the entire T3
from 1 January through 31 December 2026. It also supplies fictional apartment
lot 12, cellar lot 42, a combined 21/1,000 share, low flooding exposure, radon
level 3 and UA residential zoning. These values are sample data; official guides
explain methods and do not establish the scenario's energy, legal or site facts.
The JSON snapshot records the scenario period, map reference and solar reference.

The example preserves the original authored geometry and area values. The
49.18 m² interior total is a demonstrative sum, **not a Carrez certificate or a
measured net-area survey**. The third-floor placement is an explicit model
assumption. Annexes remain outside the interior total, and the basement is not
modeled. A general energy or planning guide cannot establish a property-specific
fact.

## Evidence classes

Use `demo` for invented scenario values, `estimated` for illustrative/model
assumptions, `derived` for calculations and `observed` for elements represented
in the model. The completed demo has no pending facts or research-question tab.
It does not use `official` to describe its example values. The schema retains
that class for future authorized source datasets.
Method links point to general official guides, never to a renamed fake response.

Translations preserve fact IDs, numeric values, status and source relationships.
The global unit preference converts displayed lengths and areas; source data and
downloads retain their original units. Text describes the example consistently
in Spanish, English and French.
A source date identifies its own observation or review; it must not imply a fresh
survey. Calculated values are not independent corroboration of their inputs.

## Adding a private dossier later

Collect only authorized originals, record issuer/date/page or field, and keep
address, parcel, building, legal lots and apartment separate. Label conventional
energy diagnosis, measured consumption and simulated energy independently.
Resolve storage/access before ingesting contracts, invoices or private photos.
The separate [architecture proposal](../architecture/property-dossier-architecture.md)
is optional future work; this separation introduces no S3 or document service.

## Verification

Run `pnpm scene:snapshot` after changing canonical data and `pnpm scene:verify`
before publishing. Unit tests compare the example extract with the canonical
model, preserve area relationships and verify that no model claim is presented
as an official property record. Browser tests exercise the full dossier and
source dialogs in all supported languages.
