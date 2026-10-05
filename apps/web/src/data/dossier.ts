import { t3Apartment } from './t3.ts'
import { DEMO_LOCATION } from './demo-location.ts'
import { APARTMENT_PLACEMENT } from './apartment-placement.ts'
import { BUILDING_SITE, SITE_BUILDINGS, SITE_PARCEL } from './building-site.ts'

export type DossierSection = 'identity' | 'building' | 'apartment' | 'energy' | 'context'
export type DossierStatus = 'official' | 'reported' | 'estimated' | 'observed' | 'pending' | 'derived' | 'demo'
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

export const dossierReviewedAt = '2026-10-05'

/** Complete fictional scenario and model references; official guides describe methods only. */
export const dossierSources: DossierSource[] = [
  {"id": "demo-scenario", "title": "Escenario ficticio completo · 2026", "publisher": "T3 Designer", "kind": "model", "description": "Datos creados para esta demo: identidad, energía, gastos, lotes, riesgos y urbanismo. Período ilustrativo del 1 de enero al 31 de diciembre de 2026; no representan un inmueble ni documentos reales.", "date": "2026-10-05", "label": "Datos ficticios · escenario 2026", "localUrl": "/dossier/demo-evidence.json"},
  {
    "id": "ban",
    "title": "Ubicación del ejemplo",
    "publisher": "T3 Designer",
    "kind": "model",
    "description": "Punto de referencia público en Place Saint-Corentin, Quimper, elegido para navegar el mapa. No es la ubicación de la residencia ficticia ni del edificio reconstruido.",
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
    "title": "Método de lectura del DPE",
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
    "description": "Guía general para entender la terminología de riesgos. El perfil de la demo procede del escenario ficticio, no de esta guía.",
    "date": "2026-10-04",
    "label": "Método de investigación",
    "url": "https://www.georisques.gouv.fr/information-des-acquereurs-et-locataires"
  },
  {
    "id": "planning",
    "title": "Método de consulta urbanística",
    "publisher": "Géoportail de l’urbanisme",
    "kind": "official-guide",
    "description": "Guía general de planes y reglamentos. La zonificación de la demo pertenece al escenario ficticio y no identifica una parcela real.",
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
  fact({"id": "official-address", "section": "identity", "label": "Nombre de la residencia ficticia", "value": "Résidence du Jardin · Quimper", "scope": "Dirección", "note": "Nombre creado para esta demo. El punto público del mapa permite explorar Quimper y no identifica una propiedad ni un titular reales.", "status": "demo", "review": "checked", "evidence": [{"sourceId": "demo-scenario", "locator": "demo-evidence.json#values.official-address"}]}),
  fact({"id": "ban-address-id", "section": "identity", "label": "Identificador local del escenario", "value": "demo-site-001", "scope": "Dirección", "status": "estimated", "evidence": [{"sourceId": "model", "locator": "demo-evidence.json#values.ban-address-id"}], "note": "Identificador interno del ejemplo. No es una clave de dirección de un servicio público.", "review": "checked"}),
  fact({ id: 'address-point', section: 'identity', label: 'Punto de ejemplo en el mapa', value: `${number(DEMO_LOCATION.latitude, 7)} · ${number(DEMO_LOCATION.longitude, 7)}`, unit: '°', scope: 'Dirección', status: 'estimated', review: 'checked', evidence: [{ sourceId: 'ban', locator: 'demo-evidence.json#values.address-point' }], note: 'Referencia pública en Place Saint-Corentin, Quimper. Sitúa el mapa, no la residencia ficticia; el origen solar regional se documenta por separado.' }),
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
  fact({"id": "floor-model", "section": "apartment", "label": "Planta del modelo", "value": "3.er piso estimado", "scope": "Departamento", "status": "estimated", "review": "checked", "evidence": [{"sourceId": "model", "locator": "demo-evidence.json#values.floor-model"}], "note": "Tercera planta ilustrativa, con balcón orientado al patio. La cave se presenta como un anexo independiente del interior."}),
  fact({"id": "living-orientation", "section": "apartment", "label": "Living y cocina hacia el patio", "value": "Suroeste · 210,79°", "scope": "Departamento", "status": "estimated", "evidence": [{"sourceId": "model", "locator": "demo-evidence.json#values.living-orientation"}], "note": "Valor conservado como ejemplo del modelo. No acredita una característica de un inmueble identificado ni una medición independiente.", "review": "checked"}),
  fact({"id": "ceiling-height", "section": "apartment", "label": "Altura interior del modelo", "value": number(APARTMENT_PLACEMENT.wallHeight, 2), "numericValue": APARTMENT_PLACEMENT.wallHeight, "unit": "m", "scope": "Departamento", "status": "estimated", "evidence": [{"sourceId": "model", "locator": "demo-evidence.json#values.ceiling-height"}], "note": "Valor conservado como ejemplo del modelo. No acredita una característica de un inmueble identificado ni una medición independiente.", "review": "checked"}),
  fact({"id": "apartment-dpe", "section": "energy", "label": "DPE de ejemplo", "value": "D", "scope": "Departamento", "note": "Clase D ficticia para el T3 en el escenario 2026. Es una categoría ilustrativa, no un diagnóstico emitido ni una inferencia a partir del consumo.", "status": "demo", "review": "checked", "evidence": [{"sourceId": "demo-scenario", "locator": "demo-evidence.json#values.apartment-dpe"}]}),
  fact({"id": "actual-energy-use", "section": "energy", "label": "Consumo anual de ejemplo", "value": "6.200", "numericValue": 6200, "unit": "kWh", "scope": "Departamento", "note": "Energía final ficticia del T3 completo, del 1 de enero al 31 de diciembre de 2026. Incluye calefacción, agua caliente y electricidad doméstica; se mantiene separada del consumo convencional del DPE.", "status": "demo", "review": "checked", "evidence": [{"sourceId": "demo-scenario", "locator": "demo-evidence.json#values.actual-energy-use"}]}),
  fact({"id": "energy-cost", "section": "energy", "label": "Gasto energético anual de ejemplo", "value": "900–1.200", "unit": "€", "scope": "Departamento", "note": "Presupuesto ficticio del T3 completo para enero–diciembre de 2026, con energía y abonos incluidos. El rango acompaña el escenario de 6.200 kWh; no son facturas ni una tarifa comercial.", "status": "demo", "review": "checked", "evidence": [{"sourceId": "demo-scenario", "locator": "demo-evidence.json#values.energy-cost"}]}),
  fact({"id": "legal-lots", "section": "context", "label": "Lotes y copropiedad de ejemplo", "value": "12 · departamento / 42 · cave", "scope": "Departamento", "note": "Lotes ficticios 12 (T3) y 42 (cave), con una cuota ilustrativa conjunta de 21/1.000 de partes comunes. Escenario 2026 sin efectos jurídicos ni vínculos con contratos reales.", "status": "demo", "review": "checked", "evidence": [{"sourceId": "demo-scenario", "locator": "demo-evidence.json#values.legal-lots"}]}),
  fact({"id": "risks", "section": "context", "label": "Perfil de riesgos de ejemplo", "value": "Inundación baja · radón 3", "scope": "Parcela", "note": "Perfil ficticio para la parcela de demostración en 2026: exposición baja a inundación y radón de nivel 3. No describe los riesgos de Place Saint-Corentin ni constituye un estado de riesgos.", "status": "demo", "review": "checked", "evidence": [{"sourceId": "demo-scenario", "locator": "demo-evidence.json#values.risks"}]}),
  fact({"id": "planning", "section": "context", "label": "Urbanismo de ejemplo", "value": "UA · uso residencial", "scope": "Parcela", "note": "Zonificación ficticia de 2026: vivienda y comercio local, con conservación del aspecto de las fachadas. Reglas creadas para la demo, sin atribuirlas al planeamiento de Quimper.", "status": "demo", "review": "checked", "evidence": [{"sourceId": "demo-scenario", "locator": "demo-evidence.json#values.planning"}]}),
]

export const dossierQuestions: DossierQuestion[] = []

export const dossierObservations: DossierObservation[] = [
  {
    "id": "hall-condition",
    "room": "Entrada",
    "title": "Suelo y servicios visibles",
    "description": "Desgaste localizado del suelo junto al acceso al baño/WC, tuberías vistas y un tablero sobre el paso al living. Son detalles representados en el modelo ilustrativo.",
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
    "description": "Parquet con desgaste, panel de placard roto, radiador junto a cocina y puerta vidriada de dos hojas hacia el balcón. Sus proporciones corresponden al modelo de ejemplo.",
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
    "description": "Dos dormitorios con ventanas de dos hojas, cajas de persiana, protección exterior y radiadores. La distribución se relaciona con las superficies del plano.",
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
    "description": "Equipamiento en U con mesadas, muebles bajos, pileta, heladera, horno/placa, campana, microondas y caldera. Inventario visual del escenario de ejemplo.",
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
    "description": "Lavabo circular sobre mesada, lavarropas frontal, espejo, ducha y tabique de bloques de vidrio. Distribución y proporciones del modelo ilustrativo.",
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
    "description": "Inodoro con cisterna, ventilación alta y puerta que abre hacia la entrada. Recinto y paso representados con las proporciones estimadas del modelo.",
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
    datasetKind: 'complete-demo',
    reviewedAt: dossierReviewedAt,
    purpose: 'Complete fictional 2026 property scenario with illustrative model values; not official property evidence.',
    geolocation: { ...DEMO_LOCATION, timeZone: BUILDING_SITE.timeZone, note: 'Public map reference only; not the location of the fictional residence or the reconstructed building.' },
    solarReference: { latitude: BUILDING_SITE.latitude, longitude: BUILDING_SITE.longitude, timeZone: BUILDING_SITE.timeZone, note: BUILDING_SITE.geolocationNote },
    scenario: { fictional: true, name: 'Résidence du Jardin · Quimper', period: '2026-01-01/2026-12-31' },
    attribution: BUILDING_SITE.attribution,
    values: Object.fromEntries(dossierFacts.map(({ id, value, numericValue, unit, status, review, scope, sourceIds, note }) => [id, { value, numericValue, unit, status, review, scope, sourceIds, note }])),
    sources: dossierSources,
  }
}
