# Official property source portals

The project foundation flow supports any explicitly selected country. The source directory in `packages/scene-schema/src/property-sources.ts` currently provides consultation links for France, Argentina, Spain, the Netherlands and the United Kingdom (`GB`). Unsupported countries return an empty list; they never fall back to France or infer a country from the address.

These entries are **portals, not imported property evidence**. Looking up a country makes no external request, submits no address, and yields no measurements, parcel identifiers or geometry. The `checkedAt` date records the directory review, not the date of any property's data. Labels, scope and descriptions are available in English, Spanish and French.

## Consultation directory

The original directory review was on 2026-10-07. GeoRef, ARBA, IDECOR and USIG
were reviewed on 2026-10-08, including the bounded API checks described below.
Other entries retain their original review date.

| Country | Official source | Intended use and scope |
| --- | --- | --- |
| France | [DGFiP cadastre](https://www.cadastre.gouv.fr/scpc/accueil.do) | Cadastral plan search by commune, address or parcel reference. Not an interior plan or building-height record. |
| France | [Base Adresse Nationale](https://adresse.data.gouv.fr/carte-base-adresse-nationale), [official dataset description](https://www.data.gouv.fr/datasets/base-adresse-nationale) | Address locations. Address matching does not establish parcel or building geometry. |
| Argentina | [Georef documentation](https://www.argentina.gob.ar/georef/georef-servicio-de-normalizacion-de-direcciones-y-unidades-territoriales-de-argentina), [address normalization](https://www.argentina.gob.ar/node/473623) | Address normalization and approximate geolocation, not cadastral parcels. |
| Argentina | [Carto ARBA](https://carto.arba.gov.ar/), [ARBA official description](https://arba.gov.ar/geoarba/inicio.asp) | Cadastral mapping for Buenos Aires province. Does not cover the autonomous City of Buenos Aires or other provinces. |
| Argentina | [Catastro Online — IDECOR](https://www.idecor.gob.ar/mapas/catastro-online-2/), [Mapas Córdoba](https://www.mapascordoba.gob.ar/) | Parcel boundaries and cadastral references for Córdoba province. Land area is not built floor area or a building footprint. |
| Argentina | [Mapa de Buenos Aires — USIG](https://mapa.buenosaires.gob.ar/), [USIG services](https://usig.buenosaires.gob.ar/apis/), [parcel dataset](https://data.buenosaires.gob.ar/dataset/parcelas) | Addresses and current parcel geometry for CABA, separate from Buenos Aires province. Parcel geometry does not provide building height or interior plans. |
| Argentina | [Argenmap](https://mapa.ign.gob.ar/), [IGN description](https://www.ign.gob.ar/AreaServicios/Argenmap/Introduccion) | Geographic context. Individual layer producers, scope and precision must be checked separately. |
| Spain | [Sede Electrónica del Catastro](https://www.sedecatastro.gob.es/), [official viewer coverage](https://www.catastro.hacienda.gob.es/ayuda/ayuda_bi.htm) | Public cadastral mapping and property records; excludes Basque Country and Navarre, which need their own authorities. Protected records require authentication. |
| Netherlands | [BAG Viewer](https://bagviewer.kadaster.nl/lvbag/bag-viewer/), [Kadaster product description](https://www.kadaster.nl/zakelijk/producten/adressen-en-gebouwen/bag-viewer) | Registered addresses and buildings, including recorded year, use and area. A building record is distinct from a cadastral parcel. |
| Netherlands | [PDOK Viewer](https://app.pdok.nl/viewer/), [official viewer guidance](https://www.pdok.nl/veel-gestelde-vragen-pdok) | Cadastral and geographic layers, with dataset-specific coverage, dates and precision. |
| United Kingdom | [HM Land Registry](https://www.gov.uk/search-property-information-land-registry) | England and Wales only. General title boundaries, not measured interior plans. Sign-in and document fees may apply. |
| United Kingdom | [ScotLIS](https://scotlis.ros.gov.uk/), [Registers of Scotland guidance](https://www.ros.gov.uk/services/get-land-and-property-information/search-property-information) | Scotland only. Some properties require a different register search; title documents may incur fees. |
| United Kingdom | [Northern Ireland Land & Property Services guidance](https://www.nidirect.gov.uk/articles/searching-land-registry) | Northern Ireland only. The public guidance currently requires a request by email, telephone or in person; it does not offer a public online search. |

The directory itself returns links only. Some viewers depend on JavaScript, so
their official agency descriptions establish their purpose without claiming a
successful property search. The Argentina adapter checks below separately
retrieved public parcel records; those checks do not certify other properties
or establish ownership.

## Agent research and review

The building workshop now uses hosted web search to research an explicitly
submitted country, region and address. The directory supplies possible starting
points; the agent is instructed to open relevant public official records, record
the URLs it consulted and identify the claims supported by each source. Portal
discovery alone does not establish a property's footprint, height or parcel.
The workflow does not sign in, purchase extracts or access protected records.

The generated candidate contains an estimated building/site model, source
citations, assumptions and unknowns. Bounded geometry validation is followed by a
model review of structured data against the cited sources, with public search
available during the review. Up to three improvement rounds can run in one
attempt. The user sees the 3D proposal and review findings, can request chat
corrections and explicitly accept a reviewed version. A citation marked
`official` describes the cited source; it is not independent certification of
the reconstruction or a guarantee that the provider's data is current.

If required footprint, height, geolocation or scale cannot be supported, the
agent requests a cadastral extract, a usable outline or more measurements.
Unavailable neighbors and roads remain absent instead of being invented. Parcel
geometry and a building footprint are separate concepts; a fallback support
contour must be labelled as non-cadastral. Model-generated geometry keeps
the `estimated` source classification; exact server-imported IGN records retain
`ign-bdtopo`. Neither classification certifies the resulting 3D extrusion.
`retrievedAt` records the consultation
date, not the date of the underlying survey.

## Direct provider acquisition

### Metropolitan France

France metropolitan addresses now use a bounded server adapter:
[IGN geocoding](https://data.geopf.fr/geocodage/search),
[Géoplateforme WFS](https://cartes.gouv.fr/aide/fr/guides-utilisateur/utiliser-les-services-de-la-geoplateforme/diffusion/wfs/)
layers `BDTOPO_V3:batiment`, `BDTOPO_V3:troncon_de_route` and
`CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle`. A strong numbered address must
fall inside a single building footprint. Coordinates are returned in Lambert-93
and translated/rotated to local geographic east/south using the
[IGN meridian-convergence formula](https://geodesie.ign.fr/files/geodesie/2025-02/alg0060.pdf);
this preserves the metric distances and areas of the records. Courtyard holes, published heights,
precision and record-modification dates are preserved. The context includes at
most 60 nearby buildings within 150 m and 100 road segments with published widths.
Missing-height buildings are omitted, and the omissions remain visible.

The backend attaches these exact records and source citations after the model
writes its explanation. The model cannot replace source coordinates directly;
explicit chat corrections use constrained, server-validated operations instead.
Roof forms and facades remain simplified; a road's published carriageway width
does not include an inferred sidewalk. The parcel containing the address point
may cover only part of the building. An ambiguous or unavailable parcel leaves
the attempt unready. Current user quotes with explicit metric measurements can
change body, roof or total height, translate a building along cardinal directions,
or resize its footprint around its center, including courtyard holes. The edited
geometry is `estimated`; immutable original records, source citations and the
complete correction history remain available. A correction uses the reviewed
snapshot and preserves unrelated buildings, roads and parcel. Ambiguous height
requests and unsupported operations still ask for clarification. See the
[private-project workflow](../workflows/private-projects.md) for supported edits
and continuity across unsuccessful attempts.

### Argentina

The country must be explicitly selected as `AR`. The server resolves the
jurisdiction from the submitted region and official address response, and uses
the matching provider. CABA and Buenos Aires province remain separate
jurisdictions; the region must identify the intended one.

[GeoRef v2 address normalization](https://apis.datos.gob.ar/georef/api/v2.0/direcciones)
supplies approximate national address locations and province identifiers. A
unique normalized address is not proof of parcel identity. Its
[published terms](https://www.argentina.gob.ar/georef/condiciones-de-uso-y-licencia)
use CC BY 4.0 and list limits of 10 requests/second, 40/minute, 2,000/hour and
10,000/day; no bulk address enumeration is part of this flow.

| Jurisdiction | Direct source | What is imported | License and date limits |
| --- | --- | --- | --- |
| Buenos Aires province (`06`) | [ARBA WFS](https://geo.arba.gov.ar/geoserver/idera/wfs), layer `idera:Parcela` | Cadastral reference `cca` and complete parcel geometry. Native capabilities declare EPSG:5347; the adapter requests and validates EPSG:4326. | [Official IDEBA metadata](https://geonetwork.ideba.gba.gob.ar/geonetwork/srv/api/records/4c46d362-980d-4438-a002-069ea76235d4) publishes CC BY 2.5 Argentina. Its maintenance cadence and metadata dates are not parcel survey dates. The area field is not imported because its units were not established. |
| Córdoba province (`14`) | [IDECOR parcel WFS](https://idecor-ws.mapascordoba.gob.ar/geoserver/idecor/parcelas/wfs/json), layer `idecor:parcelas` | `Nomenclatura`, complete parcel geometry and positive `Superficie_Tierra_Urbana` for urban parcels only. Native EPSG:22174 is requested as EPSG:4326. | [Parcel metadata](https://obs-idecor-lib.obs.sa-argentina-1.myhuaweicloud.com/metadatos/metadatos_parcelas.pdf) identifies urban land area in m² and CC BY-SA; [IDECOR terms](https://www.idecor.gob.ar/terminos-y-condiciones/) specify CC BY-SA 4.0 with attribution and share-alike for derived data, subject to producer terms. No current parcel survey date is supplied. |
| Ciudad Autónoma de Buenos Aires (`02`) | [USIG normalizer](https://servicios.usig.buenosaires.gob.ar/normalizar/), EPOK [address-to-parcel](https://epok.buenosaires.gob.ar/catastro/parcela/) and [parcel geometry](https://epok.buenosaires.gob.ar/catastro/geometria/) | Current `smp` reference, validated WGS84 parcel geometry and a usable `fecha_actualizacion`. The numbered address association is checked before geometry is accepted. | The [official parcel catalog](https://data.buenosaires.gob.ar/dataset/parcelas) publishes CC BY 2.5 Argentina. Record update dates and the catalog's semestral cadence are not field survey dates. Historical AGIP summary areas are excluded because they can disagree with current geometry. |

Provincial WFS queries use an approximately 60 m bounding box around the address
and return at most 20 candidates. A full result batch is labelled potentially
truncated even if the provider's counters also say 20. A supplied cadastral
reference instead triggers a bounded exact-reference query, scoped to the
selected province; it does not silently fall back to a nearby parcel. CABA uses
the current reference returned for the numbered address, preserving letters and
zeros. The older geocoder's SMP representation is not interchangeable with the
current EPOK reference.

Provincial WFS requests select only public spatial/reference fields. Persisted
research keeps no owners or tax-account data. Complete polygon rings, including holes, are preserved;
unsupported disjoint multipart parcels are rejected with a visible explanation.
WGS84 records are projected to a local tangent plane with X east and Z south.
Area is either the explicitly documented published m² value or is calculated
from the preserved outline, with its basis recorded. There is no inferred
altitude, terrain, roof or building height.

The user must confirm the cadastral reference before a parcel is used for a
building reconstruction. Nearby candidates and address points are not automatic
selections. Source URLs, provider identifiers, attribution, retrieval dates,
available record dates and unresolved limits travel with the research. A
confirmed reference establishes which record the user chose, not legal title or
a surveyed match to the dwelling.

Bounded live checks on **2026-10-08** retrieved ARBA geometry near La Plata's
municipal palace and an exact cadastral reference, a Córdoba urban parcel by
exact `Nomenclatura`, and CABA reference `005-056A-000` associated with the public
address Cerrito 628. The Córdoba nearby candidate was not asserted to be the
municipal building. CABA's update field was `07/10/2026`; this is retained as a
record update, not a measurement date. Local request/response evidence lives in
the ignored `artifacts/argentina-cadastre-qa/` directory.

Other Argentine provinces keep the research path until an appropriate adapter
is implemented. Santa Fe's [official OGC services](https://www.santafe.gob.ar/idesf/geoportal/paginas/servicios-OGC)
expose parcel visualization, but its [published access restrictions](https://www.santafe.gob.ar/idesf/geoportal/paginas/restricciones-de-uso)
limit downloads to registered provincial users. No Santa Fe vector adapter or
restricted download is included.

### Partial research and a supported building reconstruction

Argentina's direct import is a parcel result, not a complete building model.
`officialResearch` is saved on the attempt as soon as acquisition finishes, even
when a clarification, missing measurement, review failure or later model error
prevents a ready candidate. A follow-up keeps the acquired records and their
provenance instead of replacing them with model-generated cadastral geometry.

After the parcel reference is confirmed, public-source research can look for
the still-missing building outline, its registration within the parcel and its
height. Supplied plans or explicit measurements may provide that evidence.
The reconstruction must state separate footprint and height evidence; a parcel
outline or a conventional floor-height assumption is insufficient. If either
remains unsupported, the attempt asks for the specific missing input and keeps
its partial research.

A supported proposal combines the server-preserved official parcel with one
building classified as `estimated`. The model cannot replace the acquired
parcel, geocoding origin or source records. It cannot copy the parcel outline and
present it as independently established construction. Neighbors and streets
remain absent without their own usable sources. Preserved parcel holes that the
current 3D parcel representation cannot express block a ready proposal; they are
not silently filled. Review and explicit acceptance are still required.

### Additional adapters

Other countries retain the public-research workflow and require separate direct
provider adapters for deterministic ingestion. Overseas France needs its own
projection and coverage adapter. Each additional adapter must state its actual
capability (address matching, parcel geometry, building records or surrounding
context), access requirements, licensing and coordinate reference system. A
result must preserve the provider, source URL and record identifier, retrieval
time, source-data date when available, units, precision and any uncertainty.
Ambiguous address candidates need user confirmation before becoming the project's
location; the accepted model remains an explicit user choice.

A portal reference or an address match must never mark the building as verified.
Measured geometry, user estimates and imported official records remain
distinguishable, and unavailable data stays missing. Interior floor plans and
connections between floors are separate from a cadastral footprint.
