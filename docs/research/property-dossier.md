# Demonstration property dossier

The public Documentation view is a complete **generalized example**, reviewed
2026-10-04. It retains apartment, building, energy, references, search, evidence
cards and open research questions. It does not identify a real postal address,
legal lot, diagnosis or owner.

## Content contract

- `apps/web/src/data/dossier.ts` defines model facts, visual inventory and research
  questions. Room areas share the canonical apartment values rather than a
  separate measurement table.
- `apps/web/src/data/building-site.ts` supplies local geometry and demo IDs.
- `/dossier/demo-evidence.json` is generated from the example facts. It is not an
  archive of official HTTP responses or evidence of a real property.
- `/dossier/apartment-plan.png` is a public model-rendered plan. Its geometry and
  area values are illustrative, without an address or diagnosis identifier.
- `/dossier/reference-evidence.md` describes the reusable model and its limits.

The example preserves the original authored geometry and area values. The
49.18 m² interior total is a demonstrative sum, **not a Carrez certificate or a
measured net-area survey**. The third-floor placement is an explicit model
assumption. Annexes remain outside the interior total, and the basement is not
modeled. A general energy or planning guide cannot establish a property-specific
fact.

## Evidence classes

Use `estimated` for illustrative/model assumptions, `derived` for calculations,
`observed` for elements represented in the model and `pending` for document types
not included. The public demo does not use `official` to describe its example
values. The schema retains that class for future authorized source datasets.
Method links point to general official guides, never to a renamed fake response.

Translations preserve fact IDs, numeric values, status, source relationships and
units. Text describes the example consistently in Spanish, English and French.
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
