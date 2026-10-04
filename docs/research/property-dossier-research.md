# Research method for an authorized property dossier

This document preserves the reusable research method. The public example uses
local demo identifiers and illustrative values; private case-specific research,
address lookups, diagnosis numbers and raw responses are not published here.

## Keep the entities distinct

| Entity | Useful evidence | Limit |
| --- | --- | --- |
| Address | Address register label and point | An access point does not identify an apartment or legal lot. |
| Building | Building register, footprint and heights | The shell does not establish interior dimensions or floor. |
| Parcel | Cadastral identifier and geometry | Parcel area is not net floor area or proof of ownership. |
| Building group | Aggregated stock datasets | A representative diagnosis may concern a different apartment. |
| Apartment and annex | Authorized plan, inspection and area certificate | Drawing geometry and document transcription have different confidence. |
| Legal lots | Authorized deed and co-ownership documents | A building or dwelling count does not reconstruct legal lots. |
| Room | Named area, geometry and source | Approximate polygons do not independently validate reported area. |

## Collect traceable evidence

Each source should carry its own stable internal ID, publisher, type, access
classification, retrieval date, issuance/record date, version, license and
original storage reference. Hash an original when it is received. A hash of an
unpublished HTTP body is not a hash of a selected JSON extract.

For each assertion, record entity scope, value, unit, status, source ID and an
exact locator: printed page and PDF page, API field/JSON Pointer or video time.
Mark OCR results and transcriptions as candidates until checked. Keep conflicts
visible and never average unlike quantities to conceal disagreements.

For geography, record the projection/origin and source precision separately.
For geometry, distinguish preserved source footprints from authored facade,
opening, roof and interior assumptions. A successful render validates neither
survey accuracy nor the legal applicability of a source.

## Official methods and reusable entry points

- [RNB](https://rnb.beta.gouv.fr/faq): building identity and external relations.
- [IGN BD TOPO](https://geoservices.ign.fr/bdtopo): topographic geometry and metadata.
- [Open cadastre](https://cadastre.data.gouv.fr/): parcel data and attribution.
- [BDNB](https://bdnb.io/documentation/accueil_documentation/): group-level data,
  classifications and methods; distinguish observed, aggregated and predicted fields.
- [Service Public energy diagnosis guide](https://www.service-public.gouv.fr/particuliers/vosdroits/R67366): document verification.
- [Géorisques](https://www.georisques.gouv.fr/information-des-acquereurs-et-locataires): risk research for an authorized real case.
- [Géoportail de l’urbanisme](https://www.geoportail-urbanisme.gouv.fr/): plans and
  regulations; a portal link is not evidence of a property's planning zone.
- [Co-ownership sale documents](https://www.service-public.gouv.fr/particuliers/vosdroits/F2604): legal-lot and annex documentation.

## Energy is several different questions

An energy diagnosis describes conventional performance under a declared method.
Bills describe actual consumption over a measured period. Costs also require
prices, billing components and reference years. A rooftop simulation uses its
own irradiance, loss, installation and finance assumptions. Preserve each
quantity's units and reference period; do not annualize incomplete bills or
attribute group-level diagnoses to an apartment without a documented match.

## Publication boundary

Public sources do not automatically authorize publishing their association with
private interiors or an owner's identity. Software, reusable authored geometry,
methods and generalized examples can live publicly. Originals, authorized real
research and personal operational records belong to a separately controlled
instance. Derived screenshots and embedded scene text need the same review as
Markdown and JSON. Removing identifiers while preserving geometry is not a
promise of resistance to geometric re-identification.

A publication review covers the source tree, generated snapshots, static build,
binary metadata, screenshots and Git history. New private evidence does not
become public merely because the demo has a source-library feature.
