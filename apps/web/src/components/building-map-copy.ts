export const buildingMapCopy = {
  es: {
    title: 'Mapa de Quimper', location: 'Quimper · ubicación de ejemplo',
    marker: 'Place Saint-Corentin · ubicación de ejemplo',
    scope: 'Punto ilustrativo de la demo en Place Saint-Corentin; no corresponde al edificio real.',
    loading: 'Cargando el mapa…', failed: 'No se pudo cargar el mapa.',
    tilesFailed: 'Algunas partes del mapa no se pudieron cargar.', retry: 'Reintentar',
    recenter: 'Centrar ubicación', openMap: 'Abrir Google Maps', zoomIn: 'Acercar', zoomOut: 'Alejar',
    attribution: 'Ver atribución del mapa',
  },
  en: {
    title: 'Map of Quimper', location: 'Quimper · example location',
    marker: 'Place Saint-Corentin · example location',
    scope: 'Illustrative demo point on Place Saint-Corentin; this is not the actual building’s location.',
    loading: 'Loading the map…', failed: 'The map could not be loaded.',
    tilesFailed: 'Some parts of the map could not be loaded.', retry: 'Try again',
    recenter: 'Center location', openMap: 'Open Google Maps', zoomIn: 'Zoom in', zoomOut: 'Zoom out',
    attribution: 'Show map attribution',
  },
  fr: {
    title: 'Carte de Quimper', location: 'Quimper · emplacement d’exemple',
    marker: 'Place Saint-Corentin · emplacement d’exemple',
    scope: 'Point illustratif de la démo sur la place Saint-Corentin ; ce n’est pas l’emplacement réel du bâtiment.',
    loading: 'Chargement de la carte…', failed: 'La carte n’a pas pu être chargée.',
    tilesFailed: 'Certaines parties de la carte n’ont pas pu être chargées.', retry: 'Réessayer',
    recenter: 'Recentrer le lieu', openMap: 'Ouvrir Google Maps', zoomIn: 'Zoom avant', zoomOut: 'Zoom arrière',
    attribution: 'Afficher l’attribution de la carte',
  },
} as const
