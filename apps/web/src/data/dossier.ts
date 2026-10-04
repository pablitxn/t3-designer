import { t3Apartment } from './t3.ts'
import { APARTMENT_PLACEMENT } from './apartment-placement.ts'
import { BUILDING_SITE, SITE_BUILDINGS, SITE_PARCEL } from './building-site.ts'

export type DossierSection = 'identity' | 'building' | 'apartment' | 'energy' | 'context'
export type DossierStatus = 'official' | 'reported' | 'estimated' | 'observed' | 'pending' | 'derived'
export type DossierReview = 'checked' | 'original-pending' | 'disputed' | 'pending'
export type DossierScope = 'Dirección' | 'Parcela' | 'Edificio' | 'Grupo BDNB' | 'Departamento' | 'Estancia' | 'Balcón' | 'Cave' | 'Entorno'

export interface DossierSource {
  id: string
  title: string
  publisher: string
  kind: 'public-record' | 'reference' | 'model' | 'official-guide'
  description: string
  url?: string
  localUrl?: string
  /** Date of the consultation/review described by label, not necessarily issuance. */
  date: string
  label?: string
}

export interface DossierEvidence {
  sourceId: string
  /** Original API field, document location, photograph or model property. */
  locator: string
}

export interface DossierFact {
  id: string
  section: DossierSection
  label: string
  value: string
  unit?: string
  scope: DossierScope
  status: DossierStatus
  review: DossierReview
  sourceIds: string[]
  evidence: DossierEvidence[]
  note: string
  /** Machine-readable value only when a number is actually available. */
  numericValue?: number
  roomId?: string
}

export interface DossierQuestion {
  id: string
  title: string
  description: string
  needed: string
  sourceIds: string[]
}

export interface DossierObservation {
  id: string
  room: string
  title: string
  description: string
  evidence: string
  status: 'observed'
  sourceIds: string[]
}

export const dossierReviewedAt = '2026-10-04'

/** Generalized demonstration records; official guides describe methods only. */
export const dossierSources: DossierSource[] = [
  {
    "id": "ban",
    "title": "Ubicación de demostración",
    "publisher": "T3 Designer",
    "kind": "model",
    "description": "Origen solar regional aproximado. No representa una dirección postal ni el emplazamiento de un inmueble.",
    "date": "2026-10-04",
    "label": "Modelo de demostración · 04/10/2026",
    "localUrl": "/dossier/demo-evidence.json"
  },
  {
    "id": "rnb",
    "title": "Identidad de demostración",
    "publisher": "T3 Designer",
    "kind": "model",
    "description": "Identificadores locales de ejemplo; no permiten consultar un edificio real en un registro.",
    "date": "2026-10-04",
    "label": "Modelo de demostración · 04/10/2026",
    "localUrl": "/dossier/demo-evidence.json"
  },
  {
    "id": "cadastre",
    "title": "Parcela de demostración",
    "publisher": "T3 Designer",
    "kind": "model",
    "description": "Geometría local y superficie ilustrativa conservadas para comparar parcela, huella e interior.",
    "date": "2026-10-04",
    "label": "Modelo de demostración · 04/10/2026",
    "localUrl": "/dossier/demo-evidence.json"
  },
  {
    "id": "ign",
    "title": "Geometría de contexto",
    "publisher": "IGN · BD TOPO / T3 Designer",
    "kind": "model",
    "description": "Geometría adaptada de datos abiertos, con identificadores y geolocalización generalizados. Se conserva la atribución; no es un registro oficial del sitio de ejemplo.",
    "date": "2026-10-04",
    "label": "Modelo de demostración · 04/10/2026",
    "url": "https://geoservices.ign.fr/bdtopo",
    "localUrl": "/dossier/demo-evidence.json"
  },
  {
    "id": "bdnb",
    "title": "Características de ejemplo",
    "publisher": "T3 Designer",
    "kind": "model",
    "description": "Valores demostrativos de antigüedad, materiales y viviendas, conservados para explicar las escalas del expediente.",
    "date": "2026-10-04",
    "label": "Modelo de demostración · 04/10/2026",
    "localUrl": "/dossier/demo-evidence.json"
  },
  {
    "id": "plan",
    "title": "Plano del modelo",
    "publisher": "T3 Designer",
    "kind": "model",
    "description": "Plano renderizado desde la geometría pública. Las superficies son valores de ejemplo; no es un certificado ni una transcripción de un diagnóstico.",
    "date": "2026-10-04",
    "label": "Modelo de demostración · 04/10/2026",
    "localUrl": "/dossier/apartment-plan.png"
  },
  {
    "id": "visual",
    "title": "Inventario visual del modelo",
    "publisher": "T3 Designer",
    "kind": "model",
    "description": "Descripción de elementos visibles en la reconstrucción. Los documentos y archivos audiovisuales originales no forman parte de este expediente público.",
    "date": "2026-10-04",
    "label": "Modelo de demostración · 04/10/2026",
    "localUrl": "/dossier/reference-evidence.md"
  },
  {
    "id": "model",
    "title": "Supuestos de la reconstrucción",
    "publisher": "T3 Designer",
    "kind": "model",
    "description": "Dimensiones, altura, orientación y emplazamiento son supuestos de demostración. La geometría y los cálculos siguen siendo reproducibles.",
    "date": "2026-10-04",
    "label": "Modelo de demostración · 04/10/2026",
    "localUrl": "/dossier/demo-evidence.json"
  },
  {
    "id": "ademe",
    "title": "Método para verificar un DPE",
    "publisher": "ADEME · Service Public",
    "kind": "official-guide",
    "description": "Guía para un expediente real: un diagnóstico requiere documentos propios y no se infiere de esta demostración.",
    "date": "2026-10-04",
    "label": "Método de investigación",
    "url": "https://www.service-public.gouv.fr/particuliers/vosdroits/R67366"
  },
  {
    "id": "georisques",
    "title": "Método de consulta de riesgos",
    "publisher": "Géorisques",
    "kind": "official-guide",
    "description": "Guía general. No se emite una conclusión de riesgos para el escenario de demostración.",
    "date": "2026-10-04",
    "label": "Método de investigación",
    "url": "https://www.georisques.gouv.fr/information-des-acquereurs-et-locataires"
  },
  {
    "id": "planning",
    "title": "Método de consulta urbanística",
    "publisher": "Géoportail de l’urbanisme",
    "kind": "official-guide",
    "description": "Consulta de planes y reglamentos para un futuro expediente autorizado. La demo no identifica una parcela real.",
    "date": "2026-10-04",
    "label": "Método de investigación",
    "url": "https://www.geoportail-urbanisme.gouv.fr/"
  },
  {
    "id": "copropriete",
    "title": "Documentos de la copropriété",
    "publisher": "Service Public",
    "kind": "official-guide",
    "description": "Guía general para distinguir edificio, propiedad y lotes. No se incluyen contratos privados en el ejemplo.",
    "date": "2026-10-04",
    "label": "Método de investigación",
    "url": "https://www.service-public.gouv.fr/particuliers/vosdroits/F2604"
  }
]

const number = (value: number | null | undefined, digits = 0) => value == null ? 'Sin dato' : value.toLocaleString('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: true })
const target = SITE_BUILDINGS.find(building => building.isTarget)!
type FactInput = Omit<DossierFact, 'sourceIds' | 'review'> & { review?: DossierReview }
function fact(input: FactInput): DossierFact {
  return { ...input, review: input.review ?? (input.status === 'pending' ? 'pending' : 'checked'), sourceIds: [...new Set(input.evidence.map(item => item.sourceId))] }
}

/** Shared illustrative room areas, not certified or independently measured. */
export const dossierRoomAreas: DossierFact[] = t3Apartment.rooms.map(room => fact({
  id: `room-area-${room.id}`, roomId: room.id, section: 'apartment', label: room.name,
  value: number(room.reportedArea, 2), numericValue: room.reportedArea, unit: 'm²', scope: 'Estancia',
  status: 'estimated', evidence: [{ sourceId: 'plan', locator: `t3Apartment.rooms[id=${room.id}].reportedArea` }],
  note: 'Área de ejemplo compartida con la geometría. No es una medición independiente ni un certificado.',
}))

export const dossierFacts: DossierFact[] = [
  fact({"id": "official-address", "section": "identity", "label": "Nombre del escenario", "value": BUILDING_SITE.address, "scope": "Dirección", "status": "estimated", "evidence": [{"sourceId": "model", "locator": "demo-evidence.json#values.official-address"}], "note": "Nombre ilustrativo sin dirección postal. El expediente no identifica un propietario ni una vivienda real.", "review": "checked"}),
  fact({"id": "ban-address-id", "section": "identity", "label": "Identificador local del escenario", "value": "demo-site-001", "scope": "Dirección", "status": "estimated", "evidence": [{"sourceId": "model", "locator": "demo-evidence.json#values.ban-address-id"}], "note": "Identificador interno del ejemplo. No es una clave de dirección de un servicio público.", "review": "checked"}),
  fact({"id": "address-point", "section": "identity", "label": "Origen solar regional aproximado", "value": "48,0 · −4,0", "unit": "°", "scope": "Dirección", "status": "estimated", "evidence": [{"sourceId": "model", "locator": "demo-evidence.json#values.address-point"}], "note": "Latitud y longitud aproximadas elegidas para el cálculo solar regional; no sitúan los polígonos ni un acceso real.", "review": "checked"}),
  fact({"id": "rnb-id", "section": "identity", "label": "Referencia local del edificio", "value": BUILDING_SITE.rnbId, "scope": "Edificio", "status": "estimated", "evidence": [{"sourceId": "model", "locator": "demo-evidence.json#values.rnb-id"}], "note": "Referencia local de demostración, sin correspondencia publicada con un registro externo.", "review": "checked"}),
  fact({"id": "ign-id", "section": "identity", "label": "Identificador local del volumen", "value": BUILDING_SITE.targetId, "scope": "Edificio", "status": "estimated", "evidence": [{"sourceId": "model", "locator": "demo-evidence.json#values.ign-id"}], "note": "ID local que permite relacionar el contexto 3D y sus variantes.", "review": "checked"}),
  fact({"id": "parcel-id", "section": "identity", "label": "Parcela de demostración", "value": SITE_PARCEL.label, "scope": "Parcela", "status": "estimated", "evidence": [{"sourceId": "model", "locator": "demo-evidence.json#values.parcel-id"}], "note": "La parcela de ejemplo es distinta del edificio, del interior y de los lotes jurídicos.", "review": "checked"}),
  fact({"id": "parcel-area", "section": "identity", "label": "Superficie de parcela de ejemplo", "value": number(SITE_PARCEL.area), "numericValue": SITE_PARCEL.area, "unit": "m²", "scope": "Parcela", "status": "estimated", "evidence": [{"sourceId": "model", "locator": "demo-evidence.json#values.parcel-area"}], "note": "Superficie ilustrativa del conjunto. No es la huella construida ni la suma de las habitaciones.", "review": "checked"}),
  fact({"id": "bdnb-group", "section": "identity", "label": "Grupo de demostración", "value": "demo-group-001", "scope": "Grupo BDNB", "status": "estimated", "evidence": [{"sourceId": "model", "locator": "demo-evidence.json#values.bdnb-group"}], "note": "Valor conservado como ejemplo del modelo. No acredita una característica de un inmueble identificado ni una medición independiente.", "review": "checked"}),
  fact({"id": "construction-year", "section": "building", "label": "Año ilustrativo", "value": "1956", "numericValue": 1956, "scope": "Grupo BDNB", "status": "estimated", "evidence": [{"sourceId": "model", "locator": "demo-evidence.json#values.construction-year"}], "note": "Valor conservado como ejemplo del modelo. No acredita una característica de un inmueble identificado ni una medición independiente.", "review": "checked"}),
  fact({"id": "dwelling-count", "section": "building", "label": "Viviendas del grupo", "value": "30", "numericValue": 30, "scope": "Grupo BDNB", "status": "estimated", "evidence": [{"sourceId": "model", "locator": "demo-evidence.json#values.dwelling-count"}], "note": "Valor conservado como ejemplo del modelo. No acredita una característica de un inmueble identificado ni una medición independiente.", "review": "checked"}),
  fact({"id": "building-footprint", "section": "building", "label": "Huella de referencia", "value": "475", "numericValue": 475, "unit": "m²", "scope": "Grupo BDNB", "status": "estimated", "evidence": [{"sourceId": "model", "locator": "demo-evidence.json#values.building-footprint"}], "note": "Huella del volumen a nivel de suelo. No se suman plantas para convertirla en superficie interior.", "review": "checked"}),
  fact({"id": "building-height", "section": "building", "label": "Altura del modelo", "value": number(target.height, 1), "numericValue": target.height, "unit": "m", "scope": "Edificio", "status": "estimated", "evidence": [{"sourceId": "model", "locator": "demo-evidence.json#values.building-height"}], "note": "Altura del contorno en el modelo; la cubierta agrega su rango vertical.", "review": "checked"}),
  fact({"id": "building-mean-height", "section": "building", "label": "Altura media de ejemplo", "value": "16", "numericValue": 16, "unit": "m", "scope": "Grupo BDNB", "status": "estimated", "evidence": [{"sourceId": "model", "locator": "demo-evidence.json#values.building-mean-height"}], "note": "Valor conservado como ejemplo del modelo. No acredita una característica de un inmueble identificado ni una medición independiente.", "review": "checked"}),
  fact({"id": "ground-altitudes", "section": "building", "label": "Cotas de suelo mín. / máx.", "value": "8,8 / 8,8", "unit": "m", "scope": "Edificio", "status": "estimated", "evidence": [{"sourceId": "model", "locator": "demo-evidence.json#values.ground-altitudes"}], "note": "Valor conservado como ejemplo del modelo. No acredita una característica de un inmueble identificado ni una medición independiente.", "review": "checked"}),
  fact({"id": "roof-altitudes", "section": "building", "label": "Cotas de techo mín. / máx.", "value": "24,3 / 25,1", "unit": "m", "scope": "Edificio", "status": "estimated", "evidence": [{"sourceId": "model", "locator": "demo-evidence.json#values.roof-altitudes"}], "note": "Valor conservado como ejemplo del modelo. No acredita una característica de un inmueble identificado ni una medición independiente.", "review": "checked"}),
  fact({"id": "roof-range", "section": "building", "label": "Rango vertical del techo", "value": number(target.roofHeight, 1), "numericValue": target.roofHeight, "unit": "m", "scope": "Edificio", "status": "derived", "evidence": [{"sourceId": "model", "locator": "demo-evidence.json#values.roof-range"}], "note": "Diferencia de cotas usada como hipótesis visual de la cubierta. No determina una forma medida.", "review": "checked"}),
  fact({"id": "building-storeys", "section": "building", "label": "Plantas de ejemplo", "value": number(target.floors), "numericValue": target.floors ?? undefined, "scope": "Edificio", "status": "estimated", "evidence": [{"sourceId": "model", "locator": "demo-evidence.json#values.building-storeys"}], "note": "Valor conservado como ejemplo del modelo. No acredita una característica de un inmueble identificado ni una medición independiente.", "review": "checked"}),
  fact({"id": "source-accuracy", "section": "building", "label": "Incertidumbre de la geometría original", "value": "3 m / 2,5 m", "scope": "Edificio", "status": "estimated", "evidence": [{"sourceId": "model", "locator": "demo-evidence.json#values.source-accuracy"}], "note": "Incertidumbre de los datos geométricos originales antes de generalizar el contexto; los decimales del render no mejoran la precisión.", "review": "checked"}),
  fact({"id": "wall-material", "section": "building", "label": "Material de muros", "value": "BETON - PIERRE", "scope": "Grupo BDNB", "status": "estimated", "evidence": [{"sourceId": "model", "locator": "demo-evidence.json#values.wall-material"}], "note": "Valor conservado como ejemplo del modelo. No acredita una característica de un inmueble identificado ni una medición independiente.", "review": "checked"}),
  fact({"id": "roof-material", "section": "building", "label": "Material de cubierta", "value": "ZINC ALUMINIUM", "scope": "Grupo BDNB", "status": "estimated", "evidence": [{"sourceId": "model", "locator": "demo-evidence.json#values.roof-material"}], "note": "Valor conservado como ejemplo del modelo. No acredita una característica de un inmueble identificado ni una medición independiente.", "review": "checked"}),
  fact({"id": "ign-record-updated", "section": "building", "label": "Revisión de la demo", "value": "04/10/2026", "scope": "Edificio", "status": "estimated", "evidence": [{"sourceId": "model", "locator": "demo-evidence.json#values.ign-record-updated"}], "note": "Fecha de preparación del dataset de demostración, no de inspección ni consulta oficial.", "review": "checked"}),
  fact({"id": "apartment-carrez", "section": "apartment", "label": "Superficie interior de ejemplo", "value": number(t3Apartment.metadata.reportedCarrezArea, 2), "numericValue": t3Apartment.metadata.reportedCarrezArea, "unit": "m²", "scope": "Departamento", "status": "estimated", "review": "checked", "evidence": [{"sourceId": "model", "locator": "demo-evidence.json#values.apartment-carrez"}], "note": "Suma de referencia conservada para demostrar el desglose de superficies; no es un certificado Carrez."}),
  ...dossierRoomAreas,
  fact({"id": "apartment-area-sum", "section": "apartment", "label": "Suma de los ocho ambientes", "value": number(t3Apartment.rooms.reduce((sum, room) => sum + room.reportedArea, 0), 2), "numericValue": t3Apartment.rooms.reduce((sum, room) => sum + room.reportedArea, 0), "unit": "m²", "scope": "Departamento", "status": "derived", "evidence": [{"sourceId": "model", "locator": "demo-evidence.json#values.apartment-area-sum"}], "note": "Suma aritmética de las ocho áreas de ejemplo. No certifica superficie neta ni incorpora descuentos por muros.", "review": "checked"}),
  fact({"id": "balcony-area", "section": "apartment", "label": "Balcón", "value": number(t3Apartment.balcony?.reportedArea, 2), "numericValue": t3Apartment.balcony?.reportedArea, "unit": "m²", "scope": "Balcón", "status": "estimated", "review": "checked", "evidence": [{"sourceId": "model", "locator": "demo-evidence.json#values.balcony-area"}], "note": "Área de anexo ilustrativa, fuera del total interior del ejemplo."}),
  fact({"id": "basement-area", "section": "apartment", "label": "Cave en subsuelo", "value": number(t3Apartment.metadata.reportedBasementArea, 2), "numericValue": t3Apartment.metadata.reportedBasementArea, "unit": "m²", "scope": "Cave", "status": "estimated", "review": "checked", "evidence": [{"sourceId": "model", "locator": "demo-evidence.json#values.basement-area"}], "note": "Área de anexo ilustrativa, fuera del total interior; el subsuelo no está modelado."}),
  fact({"id": "floor-plan", "section": "apartment", "label": "Planta representada", "value": "3.er piso ilustrativo", "scope": "Departamento", "status": "estimated", "review": "checked", "evidence": [{"sourceId": "model", "locator": "demo-evidence.json#values.floor-plan"}], "note": "El plano describe la planta ilustrativa del modelo, sin referencia a un diagnóstico real."}),
  fact({"id": "floor-model", "section": "apartment", "label": "Planta del modelo", "value": "3.er piso estimado", "scope": "Departamento", "status": "estimated", "review": "checked", "evidence": [{"sourceId": "model", "locator": "demo-evidence.json#values.floor-model"}], "note": "Hipótesis de posición vertical del modelo. Un expediente real requeriría confirmar planta y cota."}),
  fact({"id": "living-orientation", "section": "apartment", "label": "Living y cocina hacia el patio", "value": "Suroeste · 210,79°", "scope": "Departamento", "status": "estimated", "evidence": [{"sourceId": "model", "locator": "demo-evidence.json#values.living-orientation"}], "note": "Valor conservado como ejemplo del modelo. No acredita una característica de un inmueble identificado ni una medición independiente.", "review": "checked"}),
  fact({"id": "ceiling-height", "section": "apartment", "label": "Altura interior del modelo", "value": number(APARTMENT_PLACEMENT.wallHeight, 2), "numericValue": APARTMENT_PLACEMENT.wallHeight, "unit": "m", "scope": "Departamento", "status": "estimated", "evidence": [{"sourceId": "model", "locator": "demo-evidence.json#values.ceiling-height"}], "note": "Valor conservado como ejemplo del modelo. No acredita una característica de un inmueble identificado ni una medición independiente.", "review": "checked"}),
  fact({"id": "apartment-dpe", "section": "energy", "label": "DPE del departamento", "value": "Pendiente de identificar", "scope": "Departamento", "status": "pending", "evidence": [{"sourceId": "ademe", "locator": "Guía de método; sin documentos del inmueble"}], "note": "Ninguna clase energética se atribuye al ejemplo. Un DPE debe verificarse con un documento propio del inmueble.", "review": "pending"}),
  fact({"id": "actual-energy-use", "section": "energy", "label": "Consumo real", "value": "Sin facturas incorporadas", "scope": "Departamento", "status": "pending", "evidence": [{"sourceId": "ademe", "locator": "Guía de método; sin documentos del inmueble"}], "note": "La demo no incluye facturas. Para un caso real, registrar períodos, energía y kWh sin confundir consumo medido con el convencional del DPE.", "review": "pending"}),
  fact({"id": "energy-cost", "section": "energy", "label": "Gasto energético", "value": "Sin datos incorporados", "scope": "Departamento", "status": "pending", "evidence": [{"sourceId": "ademe", "locator": "Guía de método; sin documentos del inmueble"}], "note": "Sin facturas ni tarifa de un inmueble real. Los escenarios financieros del edificio usan hipótesis editables.", "review": "pending"}),
  fact({"id": "legal-lots", "section": "context", "label": "Documentación de lotes", "value": "Documentación pendiente", "scope": "Departamento", "status": "pending", "evidence": [{"sourceId": "copropriete", "locator": "Guía de método; sin documentos del inmueble"}], "note": "No se publican lotes, cuotas ni contratos. En un expediente real deben contrastarse documentos autorizados.", "review": "pending"}),
  fact({"id": "risks", "section": "context", "label": "Riesgos de la parcela", "value": "Consulta específica pendiente", "scope": "Parcela", "status": "pending", "evidence": [{"sourceId": "georisques", "locator": "Guía de método; sin documentos del inmueble"}], "note": "La guía no sustituye una consulta de parcela ni un estado de riesgos.", "review": "pending"}),
  fact({"id": "planning", "section": "context", "label": "Urbanismo y patrimonio", "value": "Zonificación por cotejar", "scope": "Parcela", "status": "pending", "evidence": [{"sourceId": "planning", "locator": "Guía de método; sin documentos del inmueble"}], "note": "La demo no pertenece a una zona urbanística declarada. Un caso real necesita planos y reglamentos vigentes.", "review": "pending"}),
]

export const dossierQuestions: DossierQuestion[] = [
  {
    "id": "floor-discrepancy",
    "title": "Validar la planta en un caso real",
    "description": "La tercera planta de esta demo es una hipótesis explícita. No representa un diagnóstico ni una discrepancia documental real.",
    "needed": "Plano autorizado, designación del lote y referencia de acceso o cota.",
    "sourceIds": [
      "plan",
      "model",
      "copropriete"
    ]
  },
  {
    "id": "original-area",
    "title": "Contrastar superficies",
    "description": "La suma de los ambientes conserva los valores del ejemplo. La geometría no certifica una superficie legal.",
    "needed": "Medición o certificado autorizado, con definición de superficie y unidades.",
    "sourceIds": [
      "plan",
      "model"
    ]
  },
  {
    "id": "geometry",
    "title": "Calibrar dimensiones y orientación",
    "description": "Muros, aberturas, altura y colocación son aproximaciones del modelo.",
    "needed": "Plano acotado y orientado, espesores, alturas, medidas de aberturas y revisión visual.",
    "sourceIds": [
      "model",
      "ign",
      "visual"
    ]
  },
  {
    "id": "individual-dpe",
    "title": "Verificar energía sin mezclar fuentes",
    "description": "Un diagnóstico convencional, una factura y una simulación responden preguntas diferentes.",
    "needed": "DPE autorizado para el caso real y facturas con períodos; documentar por separado hipótesis de simulación.",
    "sourceIds": [
      "ademe",
      "model"
    ]
  },
  {
    "id": "parcel-context",
    "title": "Investigar el contexto de un caso real",
    "description": "La parcela pública de demostración no está asociada a un registro ni una zona real.",
    "needed": "Consulta autorizada de riesgos y reglas urbanísticas, conservando fecha, versión y ámbito.",
    "sourceIds": [
      "cadastre",
      "georisques",
      "planning"
    ]
  }
]

export const dossierObservations: DossierObservation[] = [
  {
    "id": "hall-condition",
    "room": "Entrada",
    "title": "Suelo y servicios visibles",
    "description": "Se observa una zona de suelo levantado o roto junto al acceso a baño/WC, tuberías vistas y un tablero sobre el paso al living. La causa y extensión exacta del daño no están establecidas.",
    "evidence": "Modelo público · hall-condition",
    "status": "observed",
    "sourceIds": [
      "visual",
      "model"
    ]
  },
  {
    "id": "living-condition",
    "room": "Living",
    "title": "Parquet, placard y salida al balcón",
    "description": "Parquet con desgaste, panel de placard roto, radiador junto a cocina y puerta vidriada de dos hojas hacia el balcón. Se documenta su presencia; no las medidas exactas.",
    "evidence": "Modelo público · living-condition",
    "status": "observed",
    "sourceIds": [
      "visual",
      "model"
    ]
  },
  {
    "id": "bedroom-openings",
    "room": "Habitaciones",
    "title": "Ventanas y radiadores",
    "description": "Dos ventanas de dos hojas, cajas de persiana, protección exterior y radiadores bajo ventana. La asociación de cada visita a la habitación de 11,81 o 9,32 m² sigue apoyada en el plano.",
    "evidence": "Modelo público · bedroom-openings",
    "status": "observed",
    "sourceIds": [
      "visual",
      "model"
    ]
  },
  {
    "id": "kitchen-layout",
    "room": "Cocina",
    "title": "Equipamiento en U",
    "description": "Mesadas y muebles bajos en U, pileta, heladera, horno/placa, campana, microondas y carcasa aparente de caldera. No se confirma un lavavajillas ni prestaciones de los equipos.",
    "evidence": "Modelo público · kitchen-layout",
    "status": "observed",
    "sourceIds": [
      "visual",
      "model"
    ]
  },
  {
    "id": "bathroom-fixtures",
    "room": "Baño",
    "title": "Lavabo, lavarropas y ducha",
    "description": "Un lavabo circular sobre mesada, lavarropas frontal, espejo, ducha y partición de bloques de vidrio. El segundo lavabo aparente es un reflejo; el encaje métrico sigue pendiente.",
    "evidence": "Modelo público · bathroom-fixtures",
    "status": "observed",
    "sourceIds": [
      "visual",
      "model"
    ]
  },
  {
    "id": "wc-door",
    "room": "WC",
    "title": "Recinto separado",
    "description": "Inodoro con cisterna, ventilación alta y puerta que abre hacia la entrada. La dimensión real del recinto y el ancho de paso deben medirse.",
    "evidence": "Modelo público · wc-door",
    "status": "observed",
    "sourceIds": [
      "visual",
      "model"
    ]
  }
]

/** Published alongside the scene snapshots; no original property records. */
export function buildDemoDossierEvidence() {
  return {
    formatVersion: 1,
    datasetKind: 'generalized-demo',
    reviewedAt: dossierReviewedAt,
    purpose: 'Illustrative model values and methodology, not official property evidence.',
    geolocation: { latitude: BUILDING_SITE.latitude, longitude: BUILDING_SITE.longitude, timeZone: BUILDING_SITE.timeZone, note: BUILDING_SITE.geolocationNote },
    attribution: BUILDING_SITE.attribution,
    values: Object.fromEntries(dossierFacts.map(({ id, value, numericValue, unit, status, scope }) => [id, { value, numericValue, unit, status, scope }])),
    sources: dossierSources,
  }
}
