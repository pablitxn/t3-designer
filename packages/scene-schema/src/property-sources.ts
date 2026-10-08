export type PropertySourceLanguage = 'en' | 'es' | 'fr'
export type PropertySourceKind = 'address' | 'cadastre' | 'building' | 'context' | 'land-registry'
export type PropertySourceText = Readonly<Record<PropertySourceLanguage, string>>

/** A place to consult, never evidence that this project's property was retrieved or verified. */
export type PropertySourcePortal = Readonly<{
  id: string
  countryCode: string
  label: string
  url: string
  kinds: readonly PropertySourceKind[]
  description: PropertySourceText
  jurisdiction: PropertySourceText
  access: 'public' | 'account-or-fees' | 'request-only'
  evidence: 'portal-only'
  /** Review date of the directory entry, not the freshness of any property data. */
  checkedAt: string
}>

const portals: readonly PropertySourcePortal[] = [
  {
    id: 'fr-cadastre', countryCode: 'FR', label: 'Cadastre — DGFiP',
    url: 'https://www.cadastre.gouv.fr/scpc/accueil.do', kinds: ['cadastre'],
    description: {
      en: 'Look up cadastral plans by address or parcel reference. Interior floor plans and building heights require other evidence.',
      es: 'Consultá planos catastrales por dirección o referencia de parcela. Los planos interiores y las alturas requieren otras fuentes.',
      fr: 'Consultez les plans cadastraux par adresse ou référence de parcelle. Les plans intérieurs et les hauteurs nécessitent d’autres sources.',
    },
    jurisdiction: { en: 'France — check commune and plan availability', es: 'Francia — verificar comuna y disponibilidad del plano', fr: 'France — vérifier la commune et la disponibilité du plan' },
    access: 'public', evidence: 'portal-only', checkedAt: '2026-10-07',
  },
  {
    id: 'fr-ban', countryCode: 'FR', label: 'Base Adresse Nationale',
    url: 'https://adresse.data.gouv.fr/carte-base-adresse-nationale', kinds: ['address'],
    description: {
      en: 'Find and check an address location. An address point does not establish parcel boundaries or building dimensions.',
      es: 'Buscá y comprobá la ubicación de una dirección. Un punto de dirección no determina los límites ni las dimensiones del edificio.',
      fr: 'Recherchez et vérifiez la position d’une adresse. Un point adresse ne détermine ni les limites parcellaires ni les dimensions du bâtiment.',
    },
    jurisdiction: { en: 'France — national address database', es: 'Francia — base nacional de direcciones', fr: 'France — base nationale des adresses' },
    access: 'public', evidence: 'portal-only', checkedAt: '2026-10-07',
  },
  {
    id: 'ar-georef', countryCode: 'AR', label: 'Georef — Argentina',
    url: 'https://www.argentina.gob.ar/georef/georef-servicio-de-normalizacion-de-direcciones-y-unidades-territoriales-de-argentina', kinds: ['address'],
    description: {
      en: 'Official address normalization and approximate geolocation service documentation. It does not supply cadastral parcels.',
      es: 'Documentación del servicio oficial de normalización de direcciones y geolocalización aproximada. No proporciona parcelas catastrales.',
      fr: 'Documentation du service officiel de normalisation des adresses et de géolocalisation approximative. Il ne fournit pas de parcelles cadastrales.',
    },
    jurisdiction: { en: 'Argentina — nationwide addresses; coverage varies', es: 'Argentina — direcciones nacionales; cobertura variable', fr: 'Argentine — adresses nationales ; couverture variable' },
    access: 'public', evidence: 'portal-only', checkedAt: '2026-10-08',
  },
  {
    id: 'ar-arba', countryCode: 'AR', label: 'Carto ARBA',
    url: 'https://carto.arba.gov.ar/', kinds: ['cadastre'],
    description: {
      en: 'Consult provincial parcel boundaries and cadastral references. Confirm the parcel reference; its boundary does not establish the building footprint or height.',
      es: 'Consultá límites de parcelas y referencias catastrales provinciales. Confirmá la referencia de la parcela; su límite no determina la huella ni la altura del edificio.',
      fr: 'Consultez les limites et références des parcelles provinciales. Confirmez la référence de parcelle ; sa limite ne détermine ni l’emprise ni la hauteur du bâtiment.',
    },
    jurisdiction: { en: 'Buenos Aires province only — excludes Buenos Aires city', es: 'Solo provincia de Buenos Aires — excluye CABA', fr: 'Province de Buenos Aires uniquement — hors ville de Buenos Aires' },
    access: 'public', evidence: 'portal-only', checkedAt: '2026-10-08',
  },
  {
    id: 'ar-idecor', countryCode: 'AR', label: 'Catastro Online — IDECOR',
    url: 'https://www.idecor.gob.ar/mapas/catastro-online-2/', kinds: ['cadastre'],
    description: {
      en: 'Consult Córdoba parcel boundaries and cadastral references. A parcel or its recorded land area does not establish the building footprint, height or interior.',
      es: 'Consultá límites de parcelas y referencias catastrales de Córdoba. La parcela y su superficie de terreno registrada no determinan la huella, la altura ni el interior del edificio.',
      fr: 'Consultez les limites et références des parcelles de Córdoba. La parcelle et sa surface foncière enregistrée ne déterminent ni l’emprise, ni la hauteur, ni l’intérieur du bâtiment.',
    },
    jurisdiction: { en: 'Córdoba province only', es: 'Solo provincia de Córdoba', fr: 'Province de Córdoba uniquement' },
    access: 'public', evidence: 'portal-only', checkedAt: '2026-10-08',
  },
  {
    id: 'ar-usig', countryCode: 'AR', label: 'Mapa de Buenos Aires — USIG',
    url: 'https://mapa.buenosaires.gob.ar/', kinds: ['address', 'cadastre'],
    description: {
      en: 'Consult city addresses and cadastral parcels. Confirm the current cadastral reference; address matching and parcel geometry do not supply a measured building model.',
      es: 'Consultá direcciones y parcelas catastrales de la ciudad. Confirmá la nomenclatura actual; la dirección y la geometría parcelaria no aportan un modelo medido del edificio.',
      fr: 'Consultez les adresses et parcelles cadastrales de la ville. Confirmez la référence actuelle ; l’adresse et la géométrie parcellaire ne fournissent pas un modèle mesuré du bâtiment.',
    },
    jurisdiction: { en: 'Buenos Aires city (CABA) only — excludes Buenos Aires province', es: 'Solo Ciudad Autónoma de Buenos Aires (CABA) — excluye la provincia de Buenos Aires', fr: 'Ville autonome de Buenos Aires (CABA) uniquement — hors province de Buenos Aires' },
    access: 'public', evidence: 'portal-only', checkedAt: '2026-10-08',
  },
  {
    id: 'ar-ign', countryCode: 'AR', label: 'Argenmap — IGN',
    url: 'https://mapa.ign.gob.ar/', kinds: ['context'],
    description: {
      en: 'Explore official geographic context and available map layers. Basemaps do not verify a property’s cadastral boundary or interior.',
      es: 'Explorá el contexto geográfico oficial y las capas disponibles. El mapa base no verifica el límite catastral ni el interior de una propiedad.',
      fr: 'Explorez le contexte géographique officiel et les couches disponibles. Le fond de carte ne vérifie ni les limites cadastrales ni l’intérieur d’un bien.',
    },
    jurisdiction: { en: 'Argentina — national geographic context', es: 'Argentina — contexto geográfico nacional', fr: 'Argentine — contexte géographique national' },
    access: 'public', evidence: 'portal-only', checkedAt: '2026-10-07',
  },
  {
    id: 'es-catastro', countryCode: 'ES', label: 'Sede Electrónica del Catastro',
    url: 'https://www.sedecatastro.gob.es/', kinds: ['cadastre', 'building'],
    description: {
      en: 'Consult cadastral maps and public property records. Protected records need authentication; interior layouts require separate plans.',
      es: 'Consultá cartografía catastral y datos públicos del inmueble. Los datos protegidos requieren identificación; la distribución interior necesita planos propios.',
      fr: 'Consultez la cartographie cadastrale et les données publiques du bien. Les données protégées nécessitent une identification ; les plans intérieurs restent nécessaires.',
    },
    jurisdiction: { en: 'Spain — excludes the Basque Country and Navarre', es: 'España — excluye País Vasco y Navarra', fr: 'Espagne — hors Pays basque et Navarre' },
    access: 'public', evidence: 'portal-only', checkedAt: '2026-10-07',
  },
  {
    id: 'nl-bag', countryCode: 'NL', label: 'BAG Viewer — Kadaster',
    url: 'https://bagviewer.kadaster.nl/lvbag/bag-viewer/', kinds: ['address', 'building'],
    description: {
      en: 'Consult registered addresses and buildings, including construction year, use and recorded area. Building records are distinct from cadastral parcels.',
      es: 'Consultá direcciones y edificios registrados, con año de construcción, uso y superficie registrada. Los edificios y las parcelas son registros distintos.',
      fr: 'Consultez les adresses et bâtiments enregistrés, avec année de construction, usage et surface enregistrée. Les bâtiments et les parcelles sont des registres distincts.',
    },
    jurisdiction: { en: 'Netherlands — BAG coverage', es: 'Países Bajos — cobertura de BAG', fr: 'Pays-Bas — couverture BAG' },
    access: 'public', evidence: 'portal-only', checkedAt: '2026-10-07',
  },
  {
    id: 'nl-pdok', countryCode: 'NL', label: 'PDOK Viewer',
    url: 'https://app.pdok.nl/viewer/', kinds: ['cadastre', 'context'],
    description: {
      en: 'Explore cadastral and geographic layers. Check the selected dataset’s scope, date and precision before using its geometry.',
      es: 'Explorá capas catastrales y geográficas. Revisá alcance, fecha y precisión de cada conjunto de datos antes de usar su geometría.',
      fr: 'Explorez les couches cadastrales et géographiques. Vérifiez la couverture, la date et la précision du jeu de données avant d’utiliser sa géométrie.',
    },
    jurisdiction: { en: 'Netherlands — coverage depends on the selected layer', es: 'Países Bajos — cobertura según la capa elegida', fr: 'Pays-Bas — couverture selon la couche choisie' },
    access: 'public', evidence: 'portal-only', checkedAt: '2026-10-07',
  },
  {
    id: 'gb-hmlr', countryCode: 'GB', label: 'HM Land Registry',
    url: 'https://www.gov.uk/search-property-information-land-registry', kinds: ['land-registry'],
    description: {
      en: 'Find registered property information and title plans showing general boundaries. Sign-in is required and document copies may cost money; these are not measured floor plans.',
      es: 'Consultá información registral y planos de límites generales. Requiere iniciar sesión y algunas copias son de pago; no son planos interiores medidos.',
      fr: 'Consultez les informations foncières et les plans de limites générales. Une connexion est nécessaire et certaines copies sont payantes ; ce ne sont pas des plans intérieurs mesurés.',
    },
    jurisdiction: { en: 'England and Wales only', es: 'Solo Inglaterra y Gales', fr: 'Angleterre et pays de Galles uniquement' },
    access: 'account-or-fees', evidence: 'portal-only', checkedAt: '2026-10-07',
  },
  {
    id: 'gb-scotlis', countryCode: 'GB', label: 'ScotLIS — Registers of Scotland',
    url: 'https://scotlis.ros.gov.uk/', kinds: ['land-registry'],
    description: {
      en: 'Search registered titles and map boundaries. Some properties need a separate register search and title documents may cost money.',
      es: 'Buscá títulos registrados y límites en el mapa. Algunos inmuebles requieren consultar otro registro y los documentos pueden ser de pago.',
      fr: 'Recherchez les titres enregistrés et les limites sur la carte. Certains biens nécessitent une recherche dans un autre registre et les documents peuvent être payants.',
    },
    jurisdiction: { en: 'Scotland only', es: 'Solo Escocia', fr: 'Écosse uniquement' },
    access: 'account-or-fees', evidence: 'portal-only', checkedAt: '2026-10-07',
  },
  {
    id: 'gb-lps', countryCode: 'GB', label: 'Land & Property Services — NI',
    url: 'https://www.nidirect.gov.uk/articles/searching-land-registry', kinds: ['land-registry'],
    description: {
      en: 'Official guidance for requesting a land registry search. Public online searching is not currently available; follow the listed request channels.',
      es: 'Guía oficial para solicitar una consulta registral. La búsqueda pública en línea no está disponible actualmente; seguí los canales de solicitud indicados.',
      fr: 'Guide officiel pour demander une recherche foncière. La recherche publique en ligne n’est actuellement pas disponible ; utilisez les canaux de demande indiqués.',
    },
    jurisdiction: { en: 'Northern Ireland only', es: 'Solo Irlanda del Norte', fr: 'Irlande du Nord uniquement' },
    access: 'request-only', evidence: 'portal-only', checkedAt: '2026-10-07',
  },
]

/** Requires an explicitly selected ISO 3166-1 alpha-2 country; never guesses from an address. */
export function getPropertySourcePortals(countryCode: string): readonly PropertySourcePortal[] {
  const normalizedCode = countryCode.trim().toUpperCase()
  return portals.filter((portal) => portal.countryCode === normalizedCode)
}
